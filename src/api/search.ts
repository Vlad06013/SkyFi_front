import { http } from '@/api/http';

import {ApiResponse, SearchResponse} from "@/types/TypeApiRespone";


/**
 * Поиск треков в базе SkyFi.
 *
 * GET /skyfy/search?q=возраст&limit=20
 */
export async function searchTracks(
    query: string,
    limit = 20,
    page = 1,
): Promise<ApiResponse<SearchResponse>> {
    const response = await http.get<ApiResponse<SearchResponse>>(
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