import { readonly, ref, watch } from 'vue';
import Echo from 'laravel-echo';
import { createEcho } from '@/realtime/echo';
import { createRouter } from '@/realtime/router';
import {
  handleDeviceChanged,
  handleDeviceConnected,
  handleDeviceDisconnected,
} from '@/realtime/handlers/devices';
import {
  handlePlaybackQueueUpdated,
  handlePlaybackStateUpdated,
  handleWaveUpdated,
} from '@/realtime/handlers/playback';
import {
  handleFriendQueueItemAdded,
  handleFriendshipRequestAccepted,
  handleFriendshipRequestSent,
  handleShareSent,
} from '@/realtime/handlers/social';
import { useAuthStore } from '@/stores/auth';
import { useDevicesStore } from '@/stores/devices';
import type {
  FriendQueueItemAddedPayload,
  FriendshipEventPayload,
  PlaybackDeviceChangedPayload,
  PlaybackDeviceConnectedPayload,
  PlaybackDeviceDisconnectedPayload,
  PlaybackQueueUpdatedPayload,
  PlaybackStateUpdatedPayload,
  ShareSentPayload,
  WaveUpdatedPayload,
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
  const devices = useDevicesStore();
  const router = createRouter({ getMyOriginIds: () => [devices.myDeviceUuid] });
  router.listen<PlaybackDeviceConnectedPayload>(channel, '.playback.device.connected', { echo: true }, handleDeviceConnected);
  router.listen<PlaybackDeviceChangedPayload>(channel, '.playback.device.changed', { echo: true }, handleDeviceChanged);
  router.listen<PlaybackDeviceDisconnectedPayload>(
    channel,
    '.playback.device.disconnected',
    { echo: true, dedup: true },
    handleDeviceDisconnected,
  );
  router.listen<FriendshipEventPayload>(channel, '.friendship.request.sent', {}, handleFriendshipRequestSent);
  router.listen<FriendshipEventPayload>(channel, '.friendship.request.accepted', {}, handleFriendshipRequestAccepted);
  router.listen<FriendQueueItemAddedPayload>(channel, '.friend.queue.item.added', {}, handleFriendQueueItemAdded);
  router.listen<ShareSentPayload>(channel, '.share.sent', {}, handleShareSent);
  // Плеер: стейт (version-gate в сторе), очередь (тост + рефетч), окно волны (рефетч целиком).
  router.listen<PlaybackStateUpdatedPayload>(channel, '.playback.state.updated', { echo: true, dedup: true }, handlePlaybackStateUpdated);
  router.listen<PlaybackQueueUpdatedPayload>(channel, '.playback.queue.updated', { echo: true, dedup: true }, handlePlaybackQueueUpdated);
  router.listen<WaveUpdatedPayload>(channel, '.playback.wave.updated', { echo: true, dedup: true }, handleWaveUpdated);
}

/** Подключение и подписка на свой канал. Повторный вызов — no-op. */
export function startRealtime(userId: number) {
  if (echo) return;
  status.value = 'connecting';
  try {
    echo = createEcho();
  } catch (cause) {
    // Например, не задан VITE_REVERB_APP_KEY — не должно убивать приложение молча.
    console.error('[realtime] не удалось создать Echo:', cause);
    status.value = 'idle';
    return;
  }
  const connection = echo.connector.pusher.connection;
  connection.bind('connected', () => {
    console.info(`[realtime] соединение установлено (user ${userId})`);
    if (!wasConnected) subscribeOwnChannel(userId);
    else reconnectHandlers.forEach((handler) => handler());
    wasConnected = true;
    status.value = 'connected';
  });
  connection.bind('disconnected', () => {
    console.warn('[realtime] соединение разорвано');
    status.value = wasConnected ? 'reconnecting' : 'offline';
  });
  connection.bind('unavailable', () => {
    console.warn('[realtime] сервер недоступен (unavailable)');
    status.value = 'offline';
  });
  connection.bind('failed', () => {
    console.error('[realtime] соединение не удалось (failed)');
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
