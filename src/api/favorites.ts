import { http } from '@/api/http';
import type { Track } from '@/types/TrackType';
import { useAuthStore } from '@/stores/auth';
import { getCachedCollection } from '@/db/appDatabase';

export interface FavoritesResponse {
    data: Track[];
    next_page_url: string | null;
    prev_page_url: string | null;
    next_cursor: string | null;
    prev_cursor: string | null;
    per_page: number;
    path: string;
}

// export async function getFavorites(): Promise<Track[]> {
//     const response = await http.get<{ data: Track[] }>('/favorites');
//
//     return response.data.data;
// }

export async function getFavorites(): Promise<Track[]> {
    try {
        console.log('[Favorites] Запрашиваем избранное с сервера...');

        const response = await http.get<{ data: Track[] }>('/favorites');
        const favorites = response.data.data;

        console.log('[Favorites] Сервер вернул избранное:', {
            tracksCount: favorites.length,
        });

        return favorites;
    } catch (serverError) {
        console.warn(
            '[Favorites] Запрос к серверу не удался. Пробуем IndexedDB...',
            serverError,
        );

        try {
            const auth = useAuthStore();
            await auth.initialize();

            const userId = auth.user?.id;

            if (userId === undefined || userId === null) {
                throw new Error(
                    'Не удалось определить пользователя для чтения кеша.',
                );
            }

            const cached = await getCachedCollection(
                'favorites',
                String(userId),
            );

            if (cached && Array.isArray(cached.tracks)) {
                const tracks = cached.tracks.map(item => item.track);

                console.log('[Favorites] Возвращаем избранное из IndexedDB:', {
                    userId,
                    tracksCount: tracks.length,
                });

                return tracks;
            }

            console.warn('[Favorites] Кеш избранного не найден.');
        } catch (cacheError) {
            console.error(
                '[Favorites] Не удалось прочитать кеш IndexedDB:',
                cacheError,
            );
        }

        // Сервер недоступен, кеш тоже не найден — передаём исходную ошибку.
        throw serverError;
    }
}

/**
 * Проверить, находится ли трек в избранном.
 */
export async function checkFavorite(trackId: number): Promise<{
    is_favorite: boolean;
    track_id: number;
}> {
    const response = await http.get(
        `/favorites/${trackId}/check`,
    );

    return response.data;
}

/**
 * Удалить трек из избранного.
 */
export async function removeFavorite(trackId: number): Promise<{
    message: string;
    is_favorite: boolean;
    track_id: number;
}> {
    const response = await http.delete(
        `/favorites/${trackId}`,
    );

    return response.data;
}

/**
 * Добавить трек SkyFi в избранное.
 */
export async function addFavorite( trackId: number): Promise<{
    message: string;
    is_favorite: boolean;
    track_id: number;
}> {
    const response = await http.post(
        `/favorites/${trackId}`,
    );

    return response.data;
}