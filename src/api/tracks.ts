import { http } from '@/api/http';

export interface Artist {
    id: number;
    name: string;
}

export interface Album {
    id: number;
    title: string;
}

export interface Track {
    id: number;
    title: string;
    description: string | null;
    artists: Artist[];
    album: Album | null;
    duration_seconds: number | null;
    play_count: number;
    created_at: string;
}

export interface TracksResponse {
    data: Track[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
}

export interface ExternalTrack {
    id: number;
    title: string;
    artist: string;
    description: string | null;
    year: number | null;
    license_url: string | null;
    downloads: number;
    source: string;
    url: string;
}

export interface ExternalSearchResponse {
    data: ExternalTrack[];
}

export interface AudioFile {
    url: string;
    filename?: string;
    size_bytes?: number | null;
    format?: string | null;
}

/**
 * Получить ответ со ссылкой на аудиофайл.
 *
 * API возвращает:
 * {
 *   "url": "http://127.0.0.1:8080/storage/tracks/uploads/..."
 * }
 */
export async function getTrackAudio(
    trackId: number,
): Promise<AudioFile> {
    const response = await http.get(
        `/tracks/${trackId}/audio`,
    );

    const result = response.data?.data ?? response.data;

    if (!result?.url) {
        throw new Error('API не вернул ссылку на аудиофайл');
    }

    return result as AudioFile;
}

/**
 * Получить список опубликованных треков из локальной базы SkyFi.
 */
export async function getTracks(): Promise<TracksResponse> {
    const response = await http.get<TracksResponse>('/tracks');

    return response.data;
}


/**
 * Поиск внешних треков.
 */
export async function searchExternalTracks(
    query: string,
    limit = 20,
): Promise<ExternalSearchResponse> {
    const response = await http.get<ExternalSearchResponse>('search', {
        params: {
            q: query,
            limit,
        },
    });

    return response.data;
}

/**
 * Получить избранные треки пользователя.
 */
export async function getFavorites(): Promise<{
    data: Track[];
}> {
    const response = await http.get<{ data: Track[] }>('/favorites');

    return response.data;
}

/**
 * Добавить трек в избранное.
 */
export async function addFavorite(
    trackId: number,
): Promise<{
    message: string;
    is_favorite: boolean;
    track_id: number;
}> {
    const response = await http.post(
        `/favorites/${trackId}`,
    );

    return response.data;
}

/**
 * Добавить внешний трек Internet Archive в избранное.
 */
export async function addExternalFavorite(
    track: ExternalTrack,
): Promise<{
    message: string;
    is_favorite: boolean;
    track_id: number;
    source_id: string;
}> {
    const response = await http.post(
        '/favorites/external',
        {
            id: track.id,
            title: track.title,
            artist: track.artist,
            description: track.description,
        },
    );

    return response.data;
}

/**
 * Удалить трек из избранного.
 */
export async function removeFavorite(
    trackId: number,
): Promise<{
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
 * Проверить, находится ли трек в избранном.
 */
export async function checkFavorite(
    trackId: number,
): Promise<{
    is_favorite: boolean;
    track_id: number;
}> {
    const response = await http.get(
        `/favorites/${trackId}/check`,
    );

    return response.data;
}
