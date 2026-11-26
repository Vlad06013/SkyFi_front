import Dexie, { type Table } from 'dexie';
import { cloneForDb } from '@/lib/download-db';
import type { AnySnapshot, FavoritesPayload, PlayerStateView, QueueItem, TrackSnapshot } from '@/types';

/**
 * Списки «Моё» (избранное и загрузки) в IndexedDB.
 * Память стора — для экрана, база — чтобы офлайн и перезагрузка
 * показали последнее известное. Серверный ответ и локальные правки
 * перезаписывают запись пользователя.
 */

interface FavoritesRow {
  userId: number;
  payload: FavoritesPayload;
}

interface UploadsRow {
  userId: number;
  items: TrackSnapshot[];
}

/** Стейт, очередь и контекст — чтобы плеер открылся без сети. */
export interface PlayerCache {
  state: PlayerStateView;
  queue: QueueItem[];
  contextItems: AnySnapshot[];
}

interface PlayerRow extends PlayerCache {
  userId: number;
}

class LibraryDatabase extends Dexie {
  favorites!: Table<FavoritesRow, number>;
  uploads!: Table<UploadsRow, number>;
  player!: Table<PlayerRow, number>;

  constructor() {
    super('SkyFiLibrary');
    this.version(1).stores({
      favorites: '&userId',
      uploads: '&userId',
    });
    this.version(2).stores({
      favorites: '&userId',
      uploads: '&userId',
      player: '&userId',
    });
    // Ссылки в снапшотах стали относительными (api.md §1.7): кеши со старыми
    // абсолютными URL выметаем — списки и стейт перезапишутся с сервера.
    this.version(3)
      .stores({
        favorites: '&userId',
        uploads: '&userId',
        player: '&userId',
      })
      .upgrade(async (tx) => {
        await tx.table('favorites').clear();
        await tx.table('uploads').clear();
        await tx.table('player').clear();
      });
  }
}

const db = new LibraryDatabase();

export function loadFavoritesCache(userId: number): Promise<FavoritesPayload | null> {
  if (!db.favorites) return Promise.resolve(null);
  return db.favorites
    .get(userId)
    .then((row) => row?.payload ?? null)
    .catch(() => null);
}

export function saveFavoritesCache(userId: number, payload: FavoritesPayload): Promise<void> {
  if (!db.favorites) return Promise.resolve();
  return db.favorites
    .put(cloneForDb({ userId, payload }))
    .then(() => undefined)
    .catch(() => undefined);
}

export function clearFavoritesCache(): Promise<void> {
  if (!db.favorites) return Promise.resolve();
  return db.favorites
    .clear()
    .then(() => undefined)
    .catch(() => undefined);
}

export function loadUploadsCache(userId: number): Promise<TrackSnapshot[] | null> {
  if (!db.uploads) return Promise.resolve(null);
  return db.uploads
    .get(userId)
    .then((row) => row?.items ?? null)
    .catch(() => null);
}

export function saveUploadsCache(userId: number, items: TrackSnapshot[]): Promise<void> {
  if (!db.uploads) return Promise.resolve();
  return db.uploads
    .put(cloneForDb({ userId, items }))
    .then(() => undefined)
    .catch(() => undefined);
}

export function clearUploadsCache(): Promise<void> {
  if (!db.uploads) return Promise.resolve();
  return db.uploads
    .clear()
    .then(() => undefined)
    .catch(() => undefined);
}

export function loadPlayerCache(userId: number): Promise<PlayerCache | null> {
  if (!db.player) return Promise.resolve(null);
  return db.player
    .get(userId)
    .then((row) => (row ? { state: row.state, queue: row.queue, contextItems: row.contextItems } : null))
    .catch(() => null);
}

export function savePlayerCache(userId: number, cache: PlayerCache): Promise<void> {
  if (!db.player) return Promise.resolve();
  return db.player
    .put(cloneForDb({ userId, ...cache }))
    .then(() => undefined)
    .catch(() => undefined);
}

export function clearPlayerCache(): Promise<void> {
  if (!db.player) return Promise.resolve();
  return db.player
    .clear()
    .then(() => undefined)
    .catch(() => undefined);
}
