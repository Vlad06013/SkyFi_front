import {computed, ref} from 'vue';
import {defineStore} from 'pinia';
import {Capacitor, CapacitorHttp} from '@capacitor/core';
import {toastController} from '@ionic/vue';
import axios from 'axios';

import {http} from '@/api/http';
import type {Track} from '@/types/TrackType';
import {resolveTrackId} from '@/api/downloads';
import {
    deleteDownload,
    getDownload,
    listDownloads,
    saveDownload,
    trackCacheKey,
    type DownloadedTrack,
} from '@/db/appDatabase';
import {
    deleteCoverImage,
    deleteTrackAudio,
    getWebAudioObjectUrl,
    revokeWebAudioObjectUrl,
    saveCoverImage,
    saveTrackAudio,
} from '@/lib/offlineFiles';

/**
 * Офлайн-скачивания. Полностью независимы от избранного:
 * своя таблица в Dexie, свои файлы, свои статусы.
 *
 * Файлы — на диске (Capacitor Filesystem) в native, блобы
 * в Dexie — в web. Плеер берёт локальный источник через
 * getLocalAudioUrl().
 */

export type DownloadStatus = 'downloading' | 'done' | 'error';

const FETCH_TIMEOUT_MS = 120_000;

async function showToast(message: string, error = false): Promise<void> {
    const toast = await toastController.create({
        message,
        duration: 4000,
        position: 'top',
        cssClass: error ? 'player-toast' : 'friends-toast',
    });

    await toast.present();
}

/** Шаг скачивания с подписью в консоль — видно, где падает. */
async function step<T>(label: string, task: () => Promise<T>): Promise<T> {
    try {
        return await task();
    } catch (error) {
        console.error(`[Downloads] Шаг «${label}» не удался:`, error);

        throw error;
    }
}

export const useDownloadsStore = defineStore('downloads', () => {
    /** Завершённые скачивания: источник для «Скачанное» и маркеров. */
    const records = ref<DownloadedTrack[]>([]);

    /** Процессы: ключ трека → downloading | error. */
    const pendingStatuses = ref(new Map<string, 'downloading' | 'error'>());

    /** Прогресс скачивания в процентах: ключ трека → 0..99. */
    const progressMap = ref(new Map<string, number>());

    const downloadedKeys = computed(
        () => new Set(records.value.map((record) => record.key)),
    );

    /** Кэш playable-URL, чтобы не дергать Dexie на каждый трек. */
    const localUrlCache = new Map<string, string>();

    let initialized = false;

    async function initialize(): Promise<void> {
        if (initialized) return;

        initialized = true;
        records.value = await listDownloads();
    }

    function isDownloaded(track: Track): boolean {
        return downloadedKeys.value.has(trackCacheKey(track));
    }

    function statusOf(track: Track): DownloadStatus | null {
        const key = trackCacheKey(track);

        if (downloadedKeys.value.has(key)) return 'done';

        return pendingStatuses.value.get(key) ?? null;
    }

    /** Процент скачивания (null — не качается сейчас). */
    function progressOf(track: Track): number | null {
        return progressMap.value.get(trackCacheKey(track)) ?? null;
    }

    /** Закачать список целиком: всё встаёт в очередь. */
    async function downloadAll(tracks: Track[]): Promise<void> {
        await initialize();

        for (const track of tracks) {
            // download() сам отфильтрует уже скачанные
            // и дубликаты в очереди.
            void download(track);
        }
    }

    // ============================================
    // ОЧЕРЕДЬ СКАЧИВАНИЯ (последовательно, по одному)
    // ============================================

    const queue: {track: Track; key: string}[] = [];
    let processing = false;

    async function download(track: Track): Promise<void> {
        await initialize();

        const key = trackCacheKey(track);

        if (downloadedKeys.value.has(key)) return;
        if (pendingStatuses.value.get(key) === 'downloading') return;

        pendingStatuses.value.set(key, 'downloading');

        queue.push({track, key});

        void processQueue();
    }

    async function processQueue(): Promise<void> {
        if (processing) return;

        processing = true;

        try {
            let job: {track: Track; key: string} | undefined;

            while ((job = queue.shift())) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    await performDownload(job.track, job.key);

                    void showToast(
                        `Скачано для офлайна: ${job.track.title}`,
                    );
                } catch (error) {
                    console.error(
                        '[Downloads] Не удалось скачать трек:',
                        error,
                    );
                    pendingStatuses.value.set(job.key, 'error');

                    void showToast(
                        `Не удалось скачать: ${job.track.title}`,
                        true,
                    );
                }
            }
        } finally {
            processing = false;
        }
    }

    async function performDownload(
        track: Track,
        key: string,
    ): Promise<void> {
        const dbId = await step('resolve-db-id', () => resolveDbId(track));

        // Аудио качаем через прокси бэка: у CDN Яндекса
        // ссылки /get-mp3/... режут Referer и отдают 403
        // на прямые нативные запросы.
        const audioBlob = await step('fetch-audio', () =>
            fetchTrackFile(dbId, key),
        );

        const saved = await step('save-audio', () =>
            saveTrackAudio(key, audioBlob),
        );

        const coverUri = await trySaveCover(track, key);

        const record: DownloadedTrack = {
            key,
            trackId: dbId,
            track: toPlainTrack(buildStoredTrack(track, dbId, coverUri)),
            fileUri: saved.fileUri,
            blob: saved.blob ?? undefined,
            coverUri,
            sizeBytes: audioBlob.size,
            downloadedAt: Date.now(),
        };

        await step('save-record', () => saveDownload(record));

        records.value = [record, ...records.value];
        pendingStatuses.value.delete(key);
    }

    /**
     * У трека уже есть наш DB id?
     * Внешние треки из поиска: id совпадает с source_id
     * и записи в базе ещё нет — резолвим через бэкенд.
     */
    function hasDbId(track: Track): boolean {
        const numericId = Number(track.id);

        if (!Number.isFinite(numericId) || numericId <= 0) {
            return false;
        }

        if (
            track.source_id
            && String(track.id) === String(track.source_id)
        ) {
            return false;
        }

        return true;
    }

    async function resolveDbId(track: Track): Promise<number> {
        if (hasDbId(track)) {
            return Number(track.id);
        }

        return resolveTrackId(track);
    }

    /** Аудиофайл трека через прокси бэка (Referer CDN). */
    async function fetchTrackFile(
        dbId: number,
        key: string,
    ): Promise<Blob> {
        try {
            // Наш axios-инстанс: подставляет Bearer-токен.
            const {data} = await http.get<Blob>(
                `tracks/${dbId}/audio-file`,
                {
                    responseType: 'blob',
                    timeout: FETCH_TIMEOUT_MS,
                    onDownloadProgress: (event) => {
                        if (!event.total) return;

                        progressMap.value.set(
                            key,
                            Math.min(
                                99,
                                Math.round(
                                    (event.loaded / event.total) * 100,
                                ),
                            ),
                        );
                    },
                },
            );

            return data;
        } finally {
            progressMap.value.delete(key);
        }
    }

    async function fetchBlob(url: string): Promise<Blob> {
        // В WebView CapacitorHttp идёт нативно — CORS
        // CDN Яндекса нам не помеха.
        if (Capacitor.isNativePlatform()) {
            const response = await CapacitorHttp.get({
                url,
                responseType: 'blob',
            });

            return response.data as Blob;
        }

        const {data} = await axios.get<Blob>(url, {
            responseType: 'blob',
            timeout: FETCH_TIMEOUT_MS,
        });

        return data;
    }

    async function trySaveCover(
        track: Track,
        key: string,
    ): Promise<string | null> {
        const coverUrl = track.meta?.album?.cover_path;

        if (!coverUrl) return null;

        try {
            const blob = await fetchBlob(coverUrl);

            return await saveCoverImage(key, blob);
        } catch (error) {
            console.warn(
                '[Downloads] Обложка не сохранена:',
                error,
            );

            return null;
        }
    }

    /** Трек для хранения: DB id + локальная обложка. */
    function buildStoredTrack(
        track: Track,
        dbId: number,
        coverUri: string | null,
    ): Track {
        const album = track.meta?.album ?? null;

        return {
            ...track,
            id: dbId,
            meta: {
                ...track.meta,
                album: album
                    ? {
                        ...album,
                        cover_path: coverUri ?? album.cover_path,
                    }
                    : album,
            },
        };
    }

    /**
     * Глубокий plain-объект трека. Треки приходят из реактивных
     * списков/очередей Vue — их прокси нельзя сериализовать
     * в IndexedDB (DataCloneError).
     */
    function toPlainTrack(track: Track): Track {
        return JSON.parse(JSON.stringify(track)) as Track;
    }

    // ============================================
    // ВОСПРОИЗВЕДЕНИЕ / УДАЛЕНИЕ
    // ============================================

    /** Локальный playable URL, если трек скачан. Иначе null. */
    async function getLocalAudioUrl(track: Track): Promise<string | null> {
        const key = trackCacheKey(track);

        const cached = localUrlCache.get(key);

        if (cached) return cached;

        const record = await getDownload(key);

        if (!record) return null;

        let url: string | null = null;

        if (Capacitor.isNativePlatform()) {
            if (record.fileUri) {
                url = Capacitor.convertFileSrc(record.fileUri);
            }
        } else if (record.blob) {
            url = getWebAudioObjectUrl(key, record.blob);
        }

        if (url) {
            localUrlCache.set(key, url);
        }

        return url;
    }

    async function remove(track: Track): Promise<void> {
        const key = trackCacheKey(track);

        const record = records.value.find((item) => item.key === key);

        if (!record) return;

        await deleteTrackAudio(record.fileUri);
        await deleteCoverImage(record.coverUri ?? null);

        revokeWebAudioObjectUrl(key);
        localUrlCache.delete(key);

        await deleteDownload(key);

        records.value = records.value.filter((item) => item.key !== key);
        pendingStatuses.value.delete(key);
    }

    /** Скачан ли трек и есть ли локальный файл для офлайна. */
    async function hasLocalAudio(track: Track): Promise<boolean> {
        return (await getLocalAudioUrl(track)) !== null;
    }

    return {
        records,
        initialize,
        isDownloaded,
        statusOf,
        progressOf,
        download,
        downloadAll,
        remove,
        getLocalAudioUrl,
        hasLocalAudio,
    };
});
