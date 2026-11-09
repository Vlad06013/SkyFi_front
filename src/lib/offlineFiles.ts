import {Capacitor} from '@capacitor/core';
import {Directory, Filesystem} from '@capacitor/filesystem';

/**
 * Слой офлайн-файлов: аудио и обложки скачанных треков.
 *
 * В нативном приложении файлы лежат на диске (Data-директория
 * приложения) и играются/показываются через Capacitor.convertFileSrc.
 * В браузере (dev) — блобы хранятся в Dexie-записи скачивания,
 * для воспроизведения делаем objectURL.
 *
 * Хранилище метаданных (что скачано) — в appDatabase (downloads),
 * этот модуль отвечает только за байты.
 */

const TRACKS_DIR = 'skyfi-tracks';
const COVERS_DIR = 'skyfi-covers';

function sanitizeFileName(key: string): string {
    return key.replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const result = reader.result as string;

            // data:<mime>;base64,<payload> — payload отдельно.
            resolve(result.slice(result.indexOf(',') + 1));
        };

        reader.onerror = () =>
            reject(reader.error ?? new Error('Blob read failed'));

        reader.readAsDataURL(blob);
    });
}

/** Воспроизводимый URL локального файла (native). */
function fileUrl(path: string): string {
    return Capacitor.convertFileSrc(path);
}

/**
 * Сохранить аудио трека. Возвращает ссылку для записи
 * в DownloadedTrack: fileUri (native) или blob (web).
 */
export async function saveTrackAudio(
    key: string,
    blob: Blob,
): Promise<{fileUri: string | null; blob: Blob | null}> {
    if (Capacitor.isNativePlatform()) {
        const base64 = await blobToBase64(blob);

        const result = await Filesystem.writeFile({
            path: `${TRACKS_DIR}/${sanitizeFileName(key)}.audio`,
            data: base64,
            directory: Directory.Data,
            recursive: true,
        });

        return {fileUri: result.uri, blob: null};
    }

    return {fileUri: null, blob};
}

/** Сохранить обложку. Возвращает playable URL или null. */
export async function saveCoverImage(
    key: string,
    blob: Blob,
): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
        const base64 = await blobToBase64(blob);

        const result = await Filesystem.writeFile({
            path: `${COVERS_DIR}/${sanitizeFileName(key)}.img`,
            data: base64,
            directory: Directory.Data,
            recursive: true,
        });

        return fileUrl(result.uri);
    }

    // Web: objectURL умирает при перезагрузке страницы,
    // а запись в IndexedDB должна пережить её — поэтому
    // храним data-URL (картинки мелкие, объём некритичен).
    return blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () =>
            reject(reader.error ?? new Error('Blob read failed'));

        reader.readAsDataURL(blob);
    });
}

/** Удалить файл аудио (native) — в web блоб удаляется вместе с записью. */
export async function deleteTrackAudio(fileUri: string | null): Promise<void> {
    if (!Capacitor.isNativePlatform() || !fileUri) return;

    try {
        await Filesystem.deleteFile({
            path: fileUri,
        });
    } catch {
        // Файл уже отсутствует — не страшно.
    }
}

/** Удалить файл обложки (native). */
export async function deleteCoverImage(coverUri: string | null): Promise<void> {
    if (!Capacitor.isNativePlatform() || !coverUri) return;

    try {
        await Filesystem.deleteFile({
            path: coverUri,
        });
    } catch {
        // Уже удалена — ок.
    }
}

// ============================================
// WEB: objectURL для блобов (живут одну сессию)
// ============================================

const webObjectUrls = new Map<string, string>();

/** Воспроизводимый URL аудио из web-блоба записи. */
export function getWebAudioObjectUrl(key: string, blob: Blob): string {
    const cached = webObjectUrls.get(key);

    if (cached) return cached;

    const url = URL.createObjectURL(blob);

    webObjectUrls.set(key, url);

    return url;
}

export function revokeWebAudioObjectUrl(key: string): void {
    const url = webObjectUrls.get(key);

    if (url) {
        URL.revokeObjectURL(url);
        webObjectUrls.delete(key);
    }
}
