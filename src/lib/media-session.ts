import { Capacitor } from '@capacitor/core';
import { MediaSession } from '@capgo/capacitor-media-session';
import type { ActionHandler, MediaSessionAction, MediaSessionPlaybackState } from '@capgo/capacitor-media-session';
import { watch } from 'vue';
import { artistsLine, snapshotCover } from '@/lib/cover';
import { usePlayerStore } from '@/stores/player';

/**
 * Нативная медиасессия (Android): при playing/paused плагин поднимает
 * foreground-service с уведомлением — без него система душит WebView
 * в фоне и музыка встаёт на паузу при сворачивании. Метаданные, состояние
 * и позиция зеркалятся из стора; кнопки уведомления/локскрина ведут в те
 * же команды, что медиа-клавиши (media-keys). В браузере — no-op.
 */
export function bindMediaSession() {
  if (!Capacitor.isNativePlatform()) return;
  const player = usePlayerStore();

  const on = (action: MediaSessionAction, run: ActionHandler) =>
    void MediaSession.setActionHandler({ action }, run).catch(() => undefined);
  on('play', () => void player.hardwareTransport('play'));
  on('pause', () => void player.hardwareTransport('pause'));
  on('nexttrack', () => player.skipNext());
  on('previoustrack', () => void player.skipPrevious());
  on('seekto', (details) => {
    if (typeof details.seekTime === 'number') player.seek(details.seekTime);
  });

  // Звук играет только с активного устройства: пульту сервис и уведомление
  // не нужны, 'none' гасит и то и другое.
  const sounding = () => player.isActiveDevice && player.effectiveCurrent != null;

  watch(
    () => player.effectiveCurrent,
    (snap) => {
      if (!snap) return;
      const artwork = snapshotCover(snap);
      void MediaSession.setMetadata({
        title: snap.title,
        artist: artistsLine(snap.artists),
        album: snap.type === 'track' ? (snap.album?.title ?? undefined) : undefined,
        artwork: artwork ? [{ src: artwork }] : [],
      }).catch(() => undefined);
    },
    { immediate: true },
  );

  function pushPosition(playing: boolean) {
    const snap = player.effectiveCurrent;
    if (!sounding() || !snap) return;
    const duration =
      (snap.type === 'track' || snap.type === 'video') && snap.duration_ms ? snap.duration_ms / 1000 : 0;
    if (!duration) return;
    void MediaSession.setPositionState({
      duration,
      position: Math.min(player.positionSeconds, duration),
      // На паузе скорость 0: иначе шторка сама крутит прогресс вперёд.
      playbackRate: playing ? 1 : 0,
    }).catch(() => undefined);
  }

  watch(
    () => [sounding(), player.state.is_playing] as const,
    ([active, playing]) => {
      const playbackState: MediaSessionPlaybackState = !active ? 'none' : playing ? 'playing' : 'paused';
      void MediaSession.setPlaybackState({ playbackState }).catch(() => undefined);
      pushPosition(playing);
    },
    { immediate: true },
  );

  // Прогресс на локскрине: редкий апдейт, дальше система сама ведёт позицию
  // по playbackRate. Без duration сессия прогресс не рисует — пропускаем.
  window.setInterval(() => pushPosition(player.state.is_playing), 5_000);
}
