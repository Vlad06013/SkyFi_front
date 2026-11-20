import { http } from '@/api/http';
import type { TrackSnapshot } from '@/types';

/** Строка текста. `time_ms: null` — текст без синхронизации (api.md §7). */
export interface LyricsLine {
  text: string;
  time_ms: number | null;
}

/** data ответа POST /audio/lyrics. `lyrics: null` — текста нет. */
export interface LyricsPayload {
  lyrics: LyricsLine[] | null;
  source_url?: string;
}

/** Текст песни по track-снапшоту (api.md §7, POST /audio/lyrics). */
export function fetchLyrics(snapshot: TrackSnapshot) {
  return http.post<LyricsPayload>('audio/lyrics', snapshot);
}
