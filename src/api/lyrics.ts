import { http } from '@/api/http';
import type { TrackSnapshot } from '@/types';

/** Строка текста. `time_ms: null` — без синхронизации; `text: ""` — разделитель строф (api.md §7). */
export interface LyricsLine {
  text: string;
  time_ms: number | null;
}

/** Текст песни по track-снапшоту (api.md §7, POST /audio/lyrics): строки текста или null — текста нет. */
export function fetchLyrics(snapshot: TrackSnapshot) {
  return http.post<LyricsLine[] | null>('audio/lyrics', snapshot);
}
