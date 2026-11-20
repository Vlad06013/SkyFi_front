import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import * as devicesApi from '@/api/devices';
import * as identity from '@/lib/device';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
import type { PlayerDevice } from '@/types';

/** Ритм heartbeat: заметно реже троттлинга роута (120/мин, api.md §4). */
export const HEARTBEAT_INTERVAL_MS = 30_000;

async function resolveDeviceName(): Promise<string> {
  try {
    const info = await Device.getInfo();
    if (info.model && !['web', 'unknown'].includes(info.model.toLowerCase())) return info.model;
  } catch {
    /* плагин недоступен — фолбэк ниже */
  }
  return Capacitor.isNativePlatform() ? 'Android-устройство' : 'Браузер';
}

function deviceType(): PlayerDevice['type'] {
  return Capacitor.isNativePlatform() ? 'phone' : 'computer';
}

export const useDevicesStore = defineStore('devices', () => {
  const toast = useToastStore();

  /** Presence-список: только онлайн-устройства пользователя (api.md §4). */
  const devices = ref<PlayerDevice[]>([]);
  /** Первичный GET прошёл (неудача сбрасывает флажок — повторим при следующем открытии шита). */
  const loaded = ref(false);
  /** Серверный id этого устройства — подпись команд и эхо-глушение (api.md §1.6). */
  const myDeviceId = ref<number | null>(null);
  /** Локальный uuid этого устройства (origin_device_id регистрации). */
  const myDeviceUuid = ref<string | null>(null);

  const activeId = computed(() => devices.value.find((device) => device.is_active)?.id ?? null);

  /** Ленивый первичный GET списка для шита устройств. */
  async function ensure() {
    if (loaded.value) return;
    try {
      devices.value = await devicesApi.fetchDevices();
      loaded.value = true;
    } catch {
      loaded.value = false;
    }
  }

  // --- Мутации списка: общие для ответов API и сокет-ивентов playback.device.*

  function applyConnected(device: PlayerDevice) {
    const index = devices.value.findIndex((item) => item.id === device.id);
    if (index >= 0) devices.value[index] = device;
    else devices.value = [...devices.value, device];
  }

  function applyChanged(deviceId: number) {
    devices.value = devices.value.map((device) => ({
      ...device,
      is_active: device.id === deviceId,
    }));
  }

  function applyDisconnected(deviceId: number) {
    devices.value = devices.value.filter((device) => device.id !== deviceId);
  }

  /** Активация устройства (api.md §4): оптимистично, откат при ошибке. */
  async function activate(id: number): Promise<boolean> {
    const prevActive = activeId.value;
    applyChanged(id);
    const echo = { origin_device_id: myDeviceId.value ?? 0, command_id: crypto.randomUUID() };
    try {
      await devicesApi.activateDevice(id, echo);
      return true;
    } catch (cause) {
      if (prevActive != null) applyChanged(prevActive);
      toast.show(cause instanceof Error ? cause.message : 'Не удалось переключить устройство', '', true);
      return false;
    }
  }

  // --- Presence: регистрация + heartbeat

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let registerPromise: Promise<boolean> | null = null;

  function startHeartbeat(uuid: string) {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      void devicesApi.sendHeartbeat(uuid).catch(() => undefined);
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  /**
   * Регистрация устройства. Идемпотентна: повторный вызов по тому же
   * uuid на бэке обновляет профиль и возвращает тот же серверный id.
   * Ошибки глушим — presence не критична для UI. true — устройство
   * зарегистрировано (можно слать heartbeat).
   */
  async function registerPresence(): Promise<boolean> {
    registerPromise ??= (async () => {
      try {
        const stored = await identity.ensureDevice();
        myDeviceUuid.value = stored.uuid;
        myDeviceId.value = stored.serverId;
        const device = await devicesApi.registerDevice({
          name: await resolveDeviceName(),
          type: deviceType(),
          origin_device_id: stored.uuid,
          command_id: crypto.randomUUID(),
        });
        await identity.saveServerId(device.id);
        myDeviceId.value = device.id;
        applyConnected(device);
        return true;
      } catch {
        /* офлайн/бэк недоступен — heartbeat не нужен */
        return false;
      }
    })().finally(() => {
      registerPromise = null;
    });
    return registerPromise;
  }

  function stopPresence() {
    stopHeartbeat();
  }

  /** Выход из сессии: чистим состояние, локальный uuid остаётся в Preferences. */
  function reset() {
    devices.value = [];
    loaded.value = false;
    myDeviceId.value = null;
    myDeviceUuid.value = null;
    stopPresence();
  }

  /**
   * Привязка к сессии и сети: регистрация и heartbeat живут, пока есть
   * авторизация и онлайн. На нативе heartbeat глушим в фоне (JS-таймеры
   * там всё равно троттлятся) и продлеваем presence при возврате.
   */
  function bindPresence() {
    const auth = useAuthStore();
    const online = useOnlineStore();
    watch(
      [() => auth.isAuthed, () => online.isOnline],
      ([authed, isOnline]) => {
        if (authed && isOnline === true) {
          void registerPresence().then((registered) => {
            if (registered && myDeviceUuid.value) startHeartbeat(myDeviceUuid.value);
          });
        } else if (!authed) {
          reset();
        } else {
          stopPresence();
        }
      },
      { immediate: true },
    );

    if (!Capacitor.isNativePlatform()) return;
    // Листенер живёт весь жизненный цикл приложения — ссылку не храним.
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && myDeviceUuid.value) {
        void devicesApi.sendHeartbeat(myDeviceUuid.value).catch(() => undefined);
        startHeartbeat(myDeviceUuid.value);
      } else {
        stopHeartbeat();
      }
    });
  }

  return {
    devices,
    loaded,
    myDeviceId,
    myDeviceUuid,
    activeId,
    ensure,
    activate,
    applyConnected,
    applyChanged,
    applyDisconnected,
    registerPresence,
    stopPresence,
    reset,
    bindPresence,
  };
});
