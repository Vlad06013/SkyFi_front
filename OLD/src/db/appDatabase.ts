
import Dexie, { type Table } from 'dexie';
import type { Track } from '@/types/TrackType';

export interface CachedTrack {
    id: number;
    position: number;
    track: Track;
}

export interface CachedCollection {
    key: string;
    userId: string;
    updatedAt: number;
    tracks: CachedTrack[];
}

/** Единый ключ трека для скачиваний/кэшей: внешние — по
 *  source, свои загрузки — по id. */
export function trackCacheKey(track: {
    id: number | string;
    source_type: string;
    source_id: string | null;
}): string {
    if (track.source_id) {
        return `${track.source_type}:${track.source_id}`;
    }

    return `${track.source_type}:${track.id}`;
}

export interface DownloadedTrack {
    /** Ключ trackCacheKey — единый для поиска/списков/плеера. */
    key: string;
    /** DB id трека (после resolve внешних). null — пока неизвестен. */
    trackId: number | null;
    track: Track;
    /** Локальный путь (Capacitor Filesystem) или null в web. */
    fileUri: string | null;
    /** Web: блоб лежит тут (в native — null, файл на диске). */
    blob?: Blob;
    /** Кэш обложки: локальный путь или objectURL. */
    coverUri?: string | null;
    sizeBytes: number;
    downloadedAt: number;
}

class SkyFiDatabase extends Dexie {
    collections!: Table<CachedCollection, string>;

    downloads!: Table<DownloadedTrack, string>;

    constructor() {
        super('SkyFiDatabase');

        this.version(1).stores({
            collections: '&[key+userId], userId, updatedAt',
        });

        // v2: офлайн-скачивания. Ключ — trackCacheKey.
        this.version(2).stores({
            collections: '&[key+userId], userId, updatedAt',
            downloads: '&key, trackId, downloadedAt',
        });
    }
}

export const appDatabase = new SkyFiDatabase();

export async function getCachedCollection(
    key: string,
    userId: string,
): Promise<CachedCollection | undefined> {
    return appDatabase.collections
        .where('[key+userId]')
        .equals([key, userId])
        .first();
}

export async function saveCachedCollection(
    collection: CachedCollection,
): Promise<void> {
    await appDatabase.collections.put(collection);
}

export async function deleteCachedCollection(
    key: string,
    userId: string,
): Promise<void> {
    await appDatabase.collections
        .where('[key+userId]')
        .equals([key, userId])
        .delete();
}

// ============================================
// СКАЧИВАНИЯ (офлайн)
// ============================================

export async function getDownload(
    key: string,
): Promise<DownloadedTrack | undefined> {
    return appDatabase.downloads.get(key);
}

export async function listDownloads(): Promise<DownloadedTrack[]> {
    const rows = await appDatabase.downloads.toArray();

    return rows.sort((a, b) => b.downloadedAt - a.downloadedAt);
}

export async function saveDownload(record: DownloadedTrack): Promise<void> {
    await appDatabase.downloads.put(record);
}

export async function deleteDownload(key: string): Promise<void> {
    await appDatabase.downloads.delete(key);
}
