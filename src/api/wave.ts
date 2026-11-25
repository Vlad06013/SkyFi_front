import { http } from '@/api/http';
import { snapshotKey } from '@/lib/playback-engine';
import type { AnySnapshot, WaveFeedbackType, WaveItem, WavePayload } from '@/types';

/**
 * Окно волны целиком (api.md §14): сервер — источник истины ротации.
 * Ответ всегда полное окно в порядке следования, пустым не бывает.
 * Рост окна приходит сокетом `playback.wave.updated` — отдельного
 * догружающего запроса нет.
 */
/** Ключи треков, которые окно уже пометило прослушанными. Отметки не снимаются. */
const playedTrackKeys = new Set<string>();

export function rememberWavePlayed(items: WaveItem[]) {
  for (const item of items) {
    if (item.played) playedTrackKeys.add(snapshotKey(item));
  }
}

export function markWaveTrackPlayed(snapshot: AnySnapshot) {
  playedTrackKeys.add(snapshotKey(snapshot));
}

export function markWaveTrackKey(key: string) {
  playedTrackKeys.add(key);
}

export function isWaveTrackPlayed(snapshot: AnySnapshot) {
  return playedTrackKeys.has(snapshotKey(snapshot));
}

export function fetchWaveWindow() {
  return http.get<WavePayload>('wave').then((payload) => {
    rememberWavePlayed(payload.snapshots);
    return payload.snapshots;
  });
}

/** Реакция ротации (api.md §14). batch_id бэк берёт из окна сам. */
export function sendWaveFeedback(trackId: string, type: WaveFeedbackType, totalPlayedSeconds?: number) {
  return http.post<unknown>('wave/feedback', {
    track_id: trackId,
    type,
    ...(totalPlayedSeconds != null
      ? { total_played_seconds: Math.round(totalPlayedSeconds * 10) / 10 }
      : {}),
  });
}

/** Снапшот без флага окна: в play и контекст плеера played не уходит. */
export function waveSnapshot(item: WaveItem): AnySnapshot {
  const { played: _played, ...snapshot } = item;
  return snapshot;
}
