import { http } from '@/api/http';

import {ApiResponse} from "@/types/TypeApiRespone";
import {type Track} from '@/types/TrackType';


/**
 * Поиск треков в базе SkyFi и внешних источниках.
 *
 * GET /skyfy/search?q=возраст&limit=20
 *
 * Ответ — единый контракт: data — плоский массив треков.
 */
export async function searchTracks(
    query: string,
    limit = 20,
    page = 1,
): Promise<ApiResponse<Track[]>> {
    const response = await http.get<ApiResponse<Track[]>>(
        '/search',
        {
            params: {
                q: query,
                limit,
                page,
            },
        },
    );

    return response.data;
}
