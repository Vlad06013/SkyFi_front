import { http } from '@/api/http';

import {ApiResponse} from "@/types/TypeApiRespone";
import {type Track} from '@/types/TrackType';


/**
 * Пагинация поиска. Курсоры — это номера страниц (opaque для фронта):
 * next_cursor не null — есть следующая страница.
 */
export interface SearchPagination {
    limit: number;
    next_cursor: string | null;
    prev_cursor: string | null;
}

export interface SearchResponse extends ApiResponse<Track[]> {
    pagination: SearchPagination | null;
}

/**
 * Поиск треков в базе SkyFi и внешних источниках.
 *
 * GET /skyfy/search?q=возраст&limit=20&page=1
 *
 * Лимит уходит в КАЖДЫЙ источник (база, Яндекс): data может
 * содержать до источников × limit треков.
 *
 * Внешние источники могут отвечать долго — таймаут минута
 * вместо глобальных 15 секунд. signal — для отмены устаревших
 * запросов при продолжающемся вводе.
 */
export async function searchTracks(
    query: string,
    limit = 20,
    page = 1,
    signal?: AbortSignal,
): Promise<SearchResponse> {
    const response = await http.get<SearchResponse>(
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
