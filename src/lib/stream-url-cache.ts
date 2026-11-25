import type { VideoHls, VideoStream } from '@/api/videos';
import { snapshotKey } from '@/lib/playback-engine';
import type { AnySnapshot } from '@/types';

/**
 * Кеш stream URL по snapshotKey (frontend.md §9): ответ get-url живёт
 * до истечения ttl, повтор трека в пределах TTL не дёргает бэк.
 * Правило потребления простое: свежая запись — валидна, дохлая —
 * выметается, потребитель перезапрашивает. Предзагрузка (useStreamPrefetch)
 * греет кеш на 2 трека вперёд и 2 назад.
 */

/** Запас до протухания: меньше — ссылка не валидна, перезапрашиваем. */
const TTL_SAFETY_MS = 5_000;

export interface CachedAudioStream {
  kind: 'audio';
  url: string;
  ttlSec: number;
  expiresAt: number;
}

export interface CachedVideoStreams {
  kind: 'video';
  streams: VideoStream[];
  hls: VideoHls | null;
  ttlSec: number;
  expiresAt: number;
}

export type CachedStream = CachedAudioStream | CachedVideoStreams;

const cache = new Map<string, CachedStream>();

/** Трек или видео — ключ один: пара source_type:source_id (api.md §1.5). */
function expiresIn(ttlSec: number): number {
  return Date.now() + ttlSec * 1000;
}

export function cacheAudioUrl(snapshot: AnySnapshot, url: string, ttlSec: number): void {
  cache.set(snapshotKey(snapshot), { kind: 'audio', url, ttlSec, expiresAt: expiresIn(ttlSec) });
}

export function cacheVideoStreams(snapshot: AnySnapshot, streams: VideoStream[], hls: VideoHls | null, ttlSec: number): void {
  cache.set(snapshotKey(snapshot), { kind: 'video', streams, hls, ttlSec, expiresAt: expiresIn(ttlSec) });
}

/** Свежая запись или null: протухшие и записи другого рода выметаются. */
export function getCachedStream(snapshot: AnySnapshot): CachedStream | null {
  const key = snapshotKey(snapshot);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt - TTL_SAFETY_MS < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry;
}

/** Поток по ссылке умер (ошибка элемента/сегмента) — ретрай пойдёт за свежим URL, не за этим. */
export function invalidateStream(snapshot: AnySnapshot): void {
  cache.delete(snapshotKey(snapshot));
}

/** Тестам и смене сессии. */
export function clearStreamCache(): void {
  cache.clear();
}
