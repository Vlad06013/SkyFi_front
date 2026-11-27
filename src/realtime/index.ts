import { readonly, ref, watch } from 'vue';
import Echo from 'laravel-echo';
import { endpointKind } from '@/lib/endpoints';
import { recordNetEvent } from '@/lib/net-log';
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
import { useOnlineStore } from '@/stores/online';
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
/** Смена домашняя/внешка рвёт сокет: после нового connect плеер должен забрать стейт. */
let resyncOnConnect = false;
/** Какой device.{uuid} канал уже подписан (presence-привязка, api.md §17). */
let deviceChannelUuid: string | null = null;
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
  // Эхо не глушим (api.md §17): догрузка от play-хука приходит с null-полями,
  // и инициатор play тоже заменяет свою копию окна.
  router.listen<WaveUpdatedPayload>(channel, '.playback.wave.updated', {}, handleWaveUpdated);
}

/**
 * Подписка на персональный канал устройства `device.{uuid}`: факт
 * подписки = привязка сокета к устройству (presence, api.md §17).
 * Подписываемся только после регистрации устройства (registered) —
 * иначе канала у юзера ещё нет. Событий в канал не шлётся.
 * Провал подписки (auth/сеть) = бэк не видит устройство и через грейс
 * сам ставит стоп: гард сбрасываем, ретрай по таймеру и на следующем
 * коннекте; исход пишем в журнал сети — на телефоне это единственный
 * способ увидеть, что presence не встал.
 */
let deviceSubscribeRetry: ReturnType<typeof setTimeout> | null = null;

function subscribeDeviceChannel() {
  if (!echo) return;
  const uuid = useDevicesStore().myDeviceUuid;
  if (!uuid || deviceChannelUuid === uuid) return;
  deviceChannelUuid = uuid;
  const channel = echo.private(`device.${uuid}`);
  channel.subscribed(() => {
    if (deviceSubscribeRetry) {
      clearTimeout(deviceSubscribeRetry);
      deviceSubscribeRetry = null;
    }
    recordNetEvent('presence', `device.${uuid} подписан`);
  });
  channel.error((cause: unknown) => {
    deviceChannelUuid = null;
    recordNetEvent('presence', `device.${uuid} подписка не удалась: ${cause instanceof Error ? cause.message : String(cause)}`);
    if (deviceSubscribeRetry) clearTimeout(deviceSubscribeRetry);
    deviceSubscribeRetry = setTimeout(() => {
      deviceSubscribeRetry = null;
      subscribeDeviceChannel();
    }, 10_000);
  });
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
  const online = useOnlineStore();
  connection.bind('connected', () => {
    console.info(`[realtime] соединение установлено (user ${userId})`);
    if (!wasConnected) subscribeOwnChannel(userId);
    subscribeDeviceChannel();
    if (wasConnected || resyncOnConnect) reconnectHandlers.forEach((handler) => handler());
    resyncOnConnect = false;
    wasConnected = true;
    status.value = 'connected';
    online.noteSocketConnected();
  });
  connection.bind('disconnected', () => {
    console.warn('[realtime] соединение разорвано');
    status.value = wasConnected ? 'reconnecting' : 'offline';
    online.noteSocketDisconnected();
  });
  connection.bind('unavailable', () => {
    console.warn('[realtime] сервер недоступен (unavailable)');
    status.value = 'offline';
    void online.noteSocketFailed('unavailable');
  });
  connection.bind('failed', () => {
    console.error('[realtime] соединение не удалось (failed)');
    status.value = 'offline';
    void online.noteSocketFailed('failed');
  });
}

/** Рестарт соединения (force-offline детектор, смена endpoint уже через watch ниже). */
export function restartRealtime() {
  const auth = useAuthStore();
  const userId = auth.user?.id;
  if (!auth.isAuthed || userId == null || !echo) return;
  resyncOnConnect = wasConnected;
  stopRealtime();
  startRealtime(userId);
}

export function stopRealtime() {
  if (!echo) return;
  echo.disconnect();
  echo = null;
  wasConnected = false;
  deviceChannelUuid = null;
  if (deviceSubscribeRetry) {
    clearTimeout(deviceSubscribeRetry);
    deviceSubscribeRetry = null;
  }
  status.value = 'idle';
  useOnlineStore().noteSocketDisconnected('stop');
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
  // Регистрация устройства доходит асинхронно: как только uuid известен
  // серверу — привязываем сокет к устройству (presence).
  const devices = useDevicesStore();
  watch(
    () => [devices.myDeviceUuid, devices.registered] as const,
    ([uuid, registered]) => {
      if (uuid && registered) subscribeDeviceChannel();
    },
    { immediate: true },
  );
  watch(endpointKind, () => {
    restartRealtime();
  });
}
