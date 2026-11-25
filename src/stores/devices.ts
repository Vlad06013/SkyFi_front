import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import * as devicesApi from '@/api/devices';
import * as identity from '@/lib/device';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
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
  /** Presence-список: только онлайн-устройства пользователя (api.md §4). */
  const devices = ref<PlayerDevice[]>([]);
  /** Presence-список хоть раз успешно загружен (сид/шит) — до этого «новое устройство» по сокету не отличить. */
  const loaded = ref(false);
  /** Постоянный uuid этого устройства — единственный его идентификатор на проводе:
   *  подпись команд (origin_device_id) и эхо-глушение (api.md §1.6). */
  const myDeviceUuid = ref<string | null>(null);

  /** Ленивый первичный GET списка для шита устройств. */
  async function ensure() {
    if (loaded.value) return;
    await refresh();
  }

  /**
   * Форс-рефетч presence-списка: открытие шита устройств, сид после
   * регистрации. Потеря presence сокетом не вещается (api.md §17),
   * поэтому свежесть — только GET'ом.
   */
  async function refresh() {
    try {
      devices.value = await devicesApi.fetchDevices();
      loaded.value = true;
    } catch {
      /* список догрузится при следующем открытии шита */
    }
  }

  // --- Мутации списка: общие для ответов API и сокет-ивентов playback.device.*
  // Признака «активности» у устройства нет (api.md §4): активное определяется
  // только state.active_device_id плеера (stores/player.applyActiveDevice).

  function applyConnected(device: PlayerDevice) {
    const index = devices.value.findIndex((item) => item.device_uuid === device.device_uuid);
    if (index >= 0) devices.value[index] = device;
    else devices.value = [...devices.value, device];
  }

  function applyDisconnected(deviceUuid: string) {
    devices.value = devices.value.filter((device) => device.device_uuid !== deviceUuid);
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
   * uuid на бэке обновляет профиль. Ошибки глушим — presence не критична
   * для UI. true — устройство зарегистрировано (можно слать heartbeat).
   */
  async function registerPresence(): Promise<boolean> {
    registerPromise ??= (async () => {
      try {
        const stored = await identity.ensureDevice();
        myDeviceUuid.value = stored.uuid;
        const device = await devicesApi.registerDevice({
          name: await resolveDeviceName(),
          type: deviceType(),
          origin_device_id: stored.uuid,
          command_id: crypto.randomUUID(),
        });
        applyConnected(device);
        // Сид presence-списка: без него «новое устройство» по сокету не
        // отличить от известного, а шит открывался бы со старым снимком.
        void refresh();
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
    myDeviceUuid,
    ensure,
    refresh,
    applyConnected,
    applyDisconnected,
    registerPresence,
    stopPresence,
    reset,
    bindPresence,
  };
});
