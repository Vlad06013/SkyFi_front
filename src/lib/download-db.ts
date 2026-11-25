import Dexie, { type Table } from 'dexie';
import { isProxy, toRaw } from 'vue';
import type { TrackSnapshot } from '@/types';
import type { CollectionSnapshot } from '@/lib/download-keys';

/** IndexedDB клонирует значение сам и падает на реактивном Proxy из Pinia. */
export function cloneForDb<T>(value: T): T {
  if (isProxy(value)) return cloneForDb(toRaw(value) as T);
  if (typeof value !== 'object' || value === null) return value;
  if (value instanceof ArrayBuffer) return value.slice(0) as T;
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as T;
  }
  if (value instanceof Blob || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => cloneForDb(item)) as T;
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    copy[key] = cloneForDb(item);
  }
  return copy as T;
}

export interface TrackRecord {
  key: string;
  snapshot: TrackSnapshot;
  path: string;
  bytes: number;
  coverPath: string | null;
  coverMime: string | null;
  downloadedAt: number;
  /** Исполнители, название и альбом — по этой строке ищет офлайн-поиск. */
  searchQuery?: string;
}

export interface CollectionRecord {
  key: string;
  snapshot: CollectionSnapshot;
  total: number;
  /** Порядок треков альбома или плейлиста. Пишется в начале закачки, до файлов. */
  trackKeys?: string[];
  coverPath: string | null;
  coverMime: string | null;
  /** Название, исполнители и строки вложенных треков. */
  searchQuery?: string;
}

export interface LinkRecord {
  id: string;
  trackKey: string;
  ownerKey: string;
}

export interface DownloadFileRecord {
  path: string;
  data: ArrayBuffer;
  mime: string;
}

class DownloadDatabase extends Dexie {
  tracks!: Table<TrackRecord, string>;
  collections!: Table<CollectionRecord, string>;
  links!: Table<LinkRecord, string>;
  files!: Table<DownloadFileRecord, string>;

  constructor() {
    super('SkyFiDownloads');
    this.version(1).stores({
      tracks: '&key',
      collections: '&key',
      links: '&id, trackKey, ownerKey',
      files: '&path',
    });
  }
}

const db = new DownloadDatabase();

export function loadDownloadDb(): Promise<{
  tracks: TrackRecord[];
  collections: CollectionRecord[];
  links: LinkRecord[];
}> {
  if (!db.tracks) return Promise.resolve({ tracks: [], collections: [], links: [] });
  return Promise.all([
    db.tracks.toArray(),
    db.collections?.toArray() ?? [],
    db.links?.toArray() ?? [],
  ]).then(([tracks, collections, links]) => ({ tracks, collections, links }));
}

export function saveTrackRecord(row: TrackRecord): Promise<void> {
  return db.tracks?.put(cloneForDb(row)).then(() => undefined) ?? Promise.resolve();
}

export function deleteTrackRecord(key: string): Promise<void> {
  return db.tracks?.delete(key).then(() => undefined) ?? Promise.resolve();
}

export function saveCollectionRecord(row: CollectionRecord): Promise<void> {
  return db.collections?.put(cloneForDb(row)).then(() => undefined) ?? Promise.resolve();
}

export function deleteCollectionRecord(key: string): Promise<void> {
  return db.collections?.delete(key).then(() => undefined) ?? Promise.resolve();
}

export function saveLinkRecord(row: LinkRecord): Promise<void> {
  return db.links?.put(cloneForDb(row)).then(() => undefined) ?? Promise.resolve();
}

export function deleteLinkRecord(id: string): Promise<void> {
  return db.links?.delete(id).then(() => undefined) ?? Promise.resolve();
}

export function saveDownloadFile(row: DownloadFileRecord): Promise<void> {
  return db.files?.put(cloneForDb(row)).then(() => undefined) ?? Promise.resolve();
}

export function readDownloadFile(path: string): Promise<DownloadFileRecord | undefined> {
  if (!db.files) return Promise.resolve(undefined);
  return db.files.get(path);
}

export function deleteDownloadFile(path: string): Promise<void> {
  return db.files?.delete(path).then(() => undefined) ?? Promise.resolve();
}
