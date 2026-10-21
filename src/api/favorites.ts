import { http } from '@/api/http';
import type { Track } from '@/api/tracks';

export interface FavoritesResponse {
    data: Track[];
}

export async function getFavorites(): Promise<FavoritesResponse> {
    const response = await http.get<FavoritesResponse>('/favorites');

    return response.data;
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