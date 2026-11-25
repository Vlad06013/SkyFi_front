import { http } from '@/api/http';
import type {
  AnySnapshot,
  EchoFields,
  PlaySource,
  PlayerStatePayload,
  RepeatMode,
} from '@/types';

/** Плеер целиком (api.md §5): состояние + очередь. */
export function fetchPlayerState() {
  return http.get<PlayerStatePayload>('player');
}

/**
 * Прямой запуск (api.md §5): «включи конкретно это». Позиция 0,
 * is_playing=true. `context_ref`/`shuffle_seed` — непрозрачные строки:
 * передали (даже null) — перезаписали, не передали — бэк не трогает.
 */
export function playSnapshot(
  snapshot: AnySnapshot,
  playbackSource: PlaySource,
  echo: EchoFields,
  extra?: { context_ref?: string | null; shuffle_seed?: string | null },
) {
  return http.post<PlayerStatePayload>('player/play', {
    snapshot,
    playback_source: playbackSource,
    origin_device_id: echo.origin_device_id,
    command_id: echo.command_id,
    ...extra,
  });
}

export function pausePlayback(echo: EchoFields, positionSeconds: number) {
  return http.post<PlayerStatePayload>('player/pause', {
    position_seconds: positionSeconds,
    origin_device_id: echo.origin_device_id,
    command_id: echo.command_id,
  });
}

export function resumePlayback(echo: EchoFields) {
  return http.post<PlayerStatePayload>('player/resume', echo);
}

export function seekTo(positionSeconds: number, echo: EchoFields) {
  return http.post<PlayerStatePayload>('player/seek', {
    position_seconds: positionSeconds,
    origin_device_id: echo.origin_device_id,
    command_id: echo.command_id,
  });
}

/**
 * Настройки (api.md §5): repeat/shuffle/clips + ролл `shuffle_seed`
 * (переключение shuffle без смены трека; выключение — seed: null).
 */
export function patchPlaybackOptions(
  options: { repeat_mode?: RepeatMode; shuffle_enabled?: boolean; clips_enabled?: boolean },
  echo: EchoFields,
  shuffleSeed?: string | null,
) {
  return http.patch<PlayerStatePayload>('player/options', {
    options,
    origin_device_id: echo.origin_device_id,
    command_id: echo.command_id,
    shuffle_seed: shuffleSeed,
  });
}
