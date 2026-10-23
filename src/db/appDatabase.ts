
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

class SkyFiDatabase extends Dexie {
    collections!: Table<CachedCollection, string>;

    constructor() {
        super('SkyFiDatabase');

        this.version(1).stores({
            collections: '&[key+userId], userId, updatedAt',
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
