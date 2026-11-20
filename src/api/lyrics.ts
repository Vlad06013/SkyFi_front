import { http } from '@/api/http';
import type { TrackSnapshot } from '@/types';

/** Строка текста. `time_ms: null` — без синхронизации; `text: ""` — разделитель строф (api.md §7). */
export interface LyricsLine {
  text: string;
  time_ms: number | null;
}

/**
 * Текст песни по track-снапшоту (api.md §7, POST /audio/lyrics).
 * На проводе форма старая — `data: {lyrics: [...]}` (curl 2026-11-20),
 * свежая правка api.md §7 рисует «голый» массив. Понимаем обе и
 * нормализуем; расхождение передано бэк-агенту на сверку.
 */
type LyricsResponse = LyricsLine[] | { lyrics: LyricsLine[] | null; source_url?: string } | null;

export async function fetchLyrics(snapshot: TrackSnapshot): Promise<LyricsLine[] | null> {
  const data = await http.post<LyricsResponse>('audio/lyrics', snapshot);
  const lines = Array.isArray(data) ? data : (data?.lyrics ?? null);
  return lines && lines.length > 0 ? lines : null;
}
