import { http } from '@/api/http';
import type { Track } from '@/api/tracks';

export interface FavoritesResponse {
    data: Track[];
}

export async function getFavorites(): Promise<FavoritesResponse> {
    const response = await http.get<FavoritesResponse>('/favorites');

    return response.data;
}