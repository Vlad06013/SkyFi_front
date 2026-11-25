import Dexie, { type Table } from 'dexie';
import type { VideoHls, VideoStream } from '@/api/videos';
import { snapshotKey } from '@/lib/playback-engine';
import type { AnySnapshot } from '@/types';

/**
 * Кеш stream URL по snapshotKey (frontend.md §9): ответ get-url живёт
 * до истечения ttl, повтор трека в пределах TTL не дёргает бэк.
 * Память — для синхронного чтения движком; IndexedDB переживает
 * перезагрузку. Протухшая запись выметается, и трек, которому нужна
 * ссылка, запрашивает get-url заново. Предзагрузка греет тот же кеш.
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

interface StreamUrlRow {
  key: string;
  entry: CachedStream;
}

class StreamUrlDatabase extends Dexie {
  urls!: Table<StreamUrlRow, string>;

  constructor() {
    super('SkyFiStreamUrls');
    this.version(1).stores({ urls: '&key' });
  }
}

const db = new StreamUrlDatabase();
const cache = new Map<string, CachedStream>();

function fresh(entry: CachedStream): boolean {
  return entry.expiresAt - TTL_SAFETY_MS >= Date.now();
}

function remember(key: string, entry: CachedStream): void {
  cache.set(key, entry);
  void db.urls?.put({ key, entry }).catch(() => undefined);
}

function forget(key: string): void {
  cache.delete(key);
  void db.urls?.delete(key).catch(() => undefined);
}

/** Трек или видео — ключ один: пара source_type:source_id (api.md §1.5). */
function expiresIn(ttlSec: number): number {
  return Date.now() + ttlSec * 1000;
}

/** Поднять кеш из базы до старта движка: иначе первый get-url уйдёт вхолостую. */
export function hydrateStreamCache(): Promise<void> {
  if (!db.urls) return Promise.resolve();
  return db.urls
    .toArray()
    .then((rows) => {
      const dead: string[] = [];
      for (const row of rows) {
        if (!row?.entry || !fresh(row.entry)) {
          if (row?.key) dead.push(row.key);
          continue;
        }
        cache.set(row.key, row.entry);
      }
      if (dead.length) void db.urls?.bulkDelete(dead).catch(() => undefined);
    })
    .catch(() => undefined);
}

export function cacheAudioUrl(snapshot: AnySnapshot, url: string, ttlSec: number): void {
  remember(snapshotKey(snapshot), { kind: 'audio', url, ttlSec, expiresAt: expiresIn(ttlSec) });
}

export function cacheVideoStreams(snapshot: AnySnapshot, streams: VideoStream[], hls: VideoHls | null, ttlSec: number): void {
  remember(snapshotKey(snapshot), { kind: 'video', streams, hls, ttlSec, expiresAt: expiresIn(ttlSec) });
}

/** Свежая запись или null: протухшие выметаются, потребитель перезапрашивает. */
export function getCachedStream(snapshot: AnySnapshot): CachedStream | null {
  const key = snapshotKey(snapshot);
  const entry = cache.get(key);
  if (!entry) return null;
  if (!fresh(entry)) {
    forget(key);
    return null;
  }
  return entry;
}

/** Поток по ссылке умер (ошибка элемента/сегмента) — ретрай пойдёт за свежим URL, не за этим. */
export function invalidateStream(snapshot: AnySnapshot): void {
  forget(snapshotKey(snapshot));
}

/** Тестам и смене сессии. */
export function clearStreamCache(): void {
  cache.clear();
  void db.urls?.clear().catch(() => undefined);
}
