import {http} from '@/api/http';
import {ApiResponse} from '@/types/TypeApiRespone';
import type {Track} from '@/types/TrackType';

/**
 * Зарегистрировать внешний трек (поиск/волна) в базе
 * и получить его DB id — нужен для /tracks/{id}/audio
 * при офлайн-скачивании.
 *
 * POST /tracks/resolve
 */
export async function resolveTrackId(track: Track): Promise<number> {
    const response = (
        await http.post<ApiResponse<{id: number}>>(
            '/tracks/resolve',
            {
                id: String(track.id),
                title: track.title,
                source_type: track.source_type,
                source_id: track.source_id,
                meta: {
                    artists: track.meta?.artists ?? [],
                },
            },
        )
    ).data;

    return response.data.id;
}
