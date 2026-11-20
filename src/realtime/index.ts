import { readonly, ref, watch } from 'vue';
import Echo from 'laravel-echo';
import { createEcho } from '@/realtime/echo';
import { createRouter } from '@/realtime/router';
import {
  handleDeviceChanged,
  handleDeviceConnected,
  handleDeviceDisconnected,
} from '@/realtime/handlers/devices';
import { useAuthStore } from '@/stores/auth';
import { useDevicesStore } from '@/stores/devices';
import type {
  PlaybackDeviceChangedPayload,
  PlaybackDeviceConnectedPayload,
  PlaybackDeviceDisconnectedPayload,
} from '@/types/realtime';

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

const status = ref<RealtimeStatus>('idle');

let echo: Echo<'reverb'> | null = null;
let wasConnected = false;
const reconnectHandlers = new Set<() => void>();

export const realtimeStatus = readonly(status);

/** Подписка на восстановление соединения (плеер сделает GET /player, api.md §17). */
export function onRealtimeReconnect(handler: () => void): () => void {
  reconnectHandlers.add(handler);
  return () => reconnectHandlers.delete(handler);
}

function subscribeOwnChannel(userId: number) {
  if (!echo) return;
  const channel = echo.private(`App.Models.User.${userId}`);
  const router = createRouter({ getMyDeviceId: () => useDevicesStore().myDeviceId });
  router.listen<PlaybackDeviceConnectedPayload>(channel, '.playback.device.connected', { echo: true }, handleDeviceConnected);
  router.listen<PlaybackDeviceChangedPayload>(channel, '.playback.device.changed', { echo: true }, handleDeviceChanged);
  router.listen<PlaybackDeviceDisconnectedPayload>(
    channel,
    '.playback.device.disconnected',
    { echo: true, dedup: true },
    handleDeviceDisconnected,
  );
}

/** Подключение и подписка на свой канал. Повторный вызов — no-op. */
export function startRealtime(userId: number) {
  if (echo) return;
  status.value = 'connecting';
  echo = createEcho();
  const connection = echo.connector.pusher.connection;
  connection.bind('connected', () => {
    if (!wasConnected) subscribeOwnChannel(userId);
    else reconnectHandlers.forEach((handler) => handler());
    wasConnected = true;
    status.value = 'connected';
  });
  connection.bind('disconnected', () => {
    status.value = wasConnected ? 'reconnecting' : 'offline';
  });
  connection.bind('unavailable', () => {
    status.value = 'offline';
  });
  connection.bind('failed', () => {
    status.value = 'offline';
  });
}

export function stopRealtime() {
  if (!echo) return;
  echo.disconnect();
  echo = null;
  wasConnected = false;
  status.value = 'idle';
}

/**
 * Жизненный цикл слоя по сессии: есть auth — подключаемся; logout/
 * сброс сессии — рвём соединение. Presence устройства живёт рядом
 * (stores/devices.bindPresence), оба стартуют из main.ts после bootstrap.
 */
export function bindSessionRealtime() {
  const auth = useAuthStore();
  watch(
    () => auth.isAuthed,
    (authed) => {
      const userId = auth.user?.id;
      if (authed && userId != null) startRealtime(userId);
      else stopRealtime();
    },
    { immediate: true },
  );
}
