import { http } from '@/api/http';
import type { AnySnapshot, WaveItem, WavePayload } from '@/types';

/**
 * Окно волны целиком (api.md §14): сервер — источник истины ротации.
 * Ответ всегда полное окно в порядке следования, пустым не бывает.
 * Рост окна приходит сокетом `playback.wave.updated` — отдельного
 * догружающего запроса нет.
 */
export function fetchWaveWindow() {
  return http.get<WavePayload>('wave').then((payload) => payload.snapshots);
}

/** Снапшот без флага окна: в play и контекст плеера played не уходит. */
export function waveSnapshot(item: WaveItem): AnySnapshot {
  const { played: _played, ...snapshot } = item;
  return snapshot;
}
