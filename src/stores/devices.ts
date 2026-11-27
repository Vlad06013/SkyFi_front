import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import * as devicesApi from '@/api/devices';
import { ApiError } from '@/api/http';
import * as identity from '@/lib/device';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import type { PlayerDevice } from '@/types';

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

/** 404 «устройство не найдено»: uuid есть локально, на сервере presence уже нет. */
export function isUnknownDevice(cause: unknown): boolean {
  return cause instanceof ApiError && cause.status === 404 && /устройств/i.test(cause.message);
}

export const useDevicesStore = defineStore('devices', () => {
  /** Presence-список: только онлайн-устройства пользователя (api.md §4). */
  const devices = ref<PlayerDevice[]>([]);
  /** Presence-список хоть раз успешно загружен (сид/шит) — до этого «новое устройство» по сокету не отличить. */
  const loaded = ref(false);
  /** Постоянный uuid этого устройства — единственный его идентификатор на проводе:
   *  подпись команд (origin_device_id) и эхо-глушение (api.md §1.6). */
  const myDeviceUuid = ref<string | null>(null);
  /** POST /player/devices для текущего uuid прошёл. Локальный uuid сам по себе сервер не знает. */
  const registered = ref(false);

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

  // --- Presence: регистрация (онлайн держит сокет, не heartbeat —
  // optimizations.md «Presence устройств на сокетах»; api.md §4/§17)

  let registerPromise: Promise<boolean> | null = null;

  /**
   * Регистрация устройства. Идемпотентна: повторный вызов по тому же
   * uuid на бэке обновляет профиль. Ошибки глушим — presence не критична
   * для UI. true — устройство зарегистрировано (uuid известен серверу,
   * realtime подпишется на device.{uuid}).
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
        registered.value = true;
        // Сид presence-списка: без него «новое устройство» по сокету не
        // отличить от известного, а шит открывался бы со старым снимком.
        void refresh();
        return true;
      } catch {
        registered.value = false;
        /* офлайн/бэк недоступен — регистрация повторится при коннекте */
        return false;
      }
    })().finally(() => {
      registerPromise = null;
    });
    return registerPromise;
  }

  /**
   * Устройство известно серверу. Повторный вызов, пока регистрация жива,
   * сеть не трогает: POST идемпотентен, но лимит 30/мин.
   */
  async function ensurePresence(): Promise<boolean> {
    if (registered.value && myDeviceUuid.value) return true;
    return registerPresence();
  }

  /** Выход из сессии: чистим состояние, локальный uuid остаётся в Preferences. */
  function reset() {
    devices.value = [];
    loaded.value = false;
    myDeviceUuid.value = null;
    registered.value = false;
  }

  /**
   * Привязка к сессии и сети. Онлайн устройства держит сокет: подписка
   * realtime на `device.{uuid}` = presence (api.md §17). Регистрация
   * нужна один раз и после потерь; в фоне интервалов нет — процесс убит,
   * сокет мёртв, офлайн честный; процесс жив — ConnectionService держит
   * сокет. Возврат на экран перепроверяет регистрацию (идемпотентный
   * POST): пока приложение спало, отметка могла не доехать.
   */
  function bindPresence() {
    const auth = useAuthStore();
    const online = useOnlineStore();
    watch(
      [() => auth.isAuthed, () => online.isOnline],
      ([authed, isOnline]) => {
        if (authed && isOnline === true) {
          void registerPresence();
        } else if (!authed) {
          reset();
        }
      },
      { immediate: true },
    );

    if (!Capacitor.isNativePlatform()) return;
    // Листенер живёт весь жизненный цикл приложения — ссылку не храним.
    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      if (!useAuthStore().isAuthed || useOnlineStore().isOnline !== true) return;
      void registerPresence();
    });
  }

  return {
    devices,
    loaded,
    myDeviceUuid,
    registered,
    ensure,
    ensurePresence,
    refresh,
    applyConnected,
    applyDisconnected,
    registerPresence,
    reset,
    bindPresence,
  };
});
