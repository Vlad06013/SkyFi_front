import type { VideoStream } from '@/api/videos';
import { snapshotKey } from '@/lib/playback-engine';
import type { TrackSnapshot, VideoSnapshot } from '@/types';

/**
 * Сессионный кеш резолва «трек → видео» (режим клипов, api.md §8): резолв —
 * самый тяжёлый запрос цепочки (поиск YouTube, 60/мин), а связь стабильна.
 * Только память, без IndexedDB: персистентность резолва — забота бэка
 * (глобальный кеш), дублировать её на устройстве не нужно. Кешируем и
 * промахи (video: null) — треки без клипа иначе перерезолвивались бы при
 * каждом повторе; у промаха короткий TTL: смена cookies/матчинга могла
 * оживить трек. Инвалидация — под будущий ручной выбор видео пользователем.
 */

export interface ClipResolveHit {
  video: VideoSnapshot | null;
  streams: VideoStream[];
}

interface ClipResolveEntry extends ClipResolveHit {
  at: number;
}

/** Промах («клипа нет») живёт меньше: внешние условия могли измениться. */
const NULL_TTL_MS = 15 * 60_000;

const cache = new Map<string, ClipResolveEntry>();

/** Запись есть и жива → результат; нет → undefined (undefined ≠ «клипа нет»). */
export function getCachedClipResolve(track: TrackSnapshot): ClipResolveHit | undefined {
  const key = snapshotKey(track);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.video == null && Date.now() - entry.at > NULL_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return { video: entry.video, streams: entry.streams };
}

export function cacheClipResolve(track: TrackSnapshot, video: VideoSnapshot | null, streams: VideoStream[]): void {
  cache.set(snapshotKey(track), { video, streams, at: Date.now() });
}

/** Ручной выбор видео/сброс матчинга: следующий резолв пойдёт в сеть. */
export function invalidateClipResolve(track: TrackSnapshot): void {
  cache.delete(snapshotKey(track));
}

/** Тестам и смене сессии. */
export function clearClipResolveCache(): void {
  cache.clear();
}
