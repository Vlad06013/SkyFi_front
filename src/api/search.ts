import { http } from '@/api/http';

import {ApiResponse} from "@/types/TypeApiRespone";
import {type Track} from '@/types/TrackType';


/**
 * Поиск треков в базе SkyFi и внешних источниках.
 *
 * GET /skyfy/search?q=возраст&limit=20
 *
 * Ответ — единый контракт: data — плоский массив треков.
 *
 * Внешние источники (Яндекс) могут отвечать долго — таймаут минута
 * вместо глобальных 15 секунд. signal — для отмены устаревших
 * запросов при продолжающемся вводе.
 */
export async function searchTracks(
    query: string,
    limit = 20,
    page = 1,
    signal?: AbortSignal,
): Promise<ApiResponse<Track[]>> {
    const response = await http.get<ApiResponse<Track[]>>(
        '/search',
        {
            params: {
                q: query,
                limit,
                page,
            },
            signal,
            timeout: 60000,
        },
    );

    return response.data;
}
