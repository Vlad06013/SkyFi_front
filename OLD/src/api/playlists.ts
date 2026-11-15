import { http } from '@/api/http';
import type { Track } from '@/types/TrackType';

// ============================================
// ТИПЫ
// ============================================

/**
 * Плейлист пользователя.
 *
 * В списке (GET /playlists) поле tracks не заполняется,
 * доступно только количество tracks_count.
 */
export interface Playlist {
    id: number;
    user_id: number;
    name: string;
    description: string | null;
    cover_path: string | null;
    is_public: boolean;
    tracks_count: number;
    created_at: string;
    updated_at: string;
}

/**
 * Плейлист с полным списком треков.
 *
 * Возвращается GET /playlists/{playlist}.
 * Треки отсортированы по pivot.position.
 */
export interface PlaylistWithTracks extends Playlist {
    tracks: Track[];
}

export interface PlaylistsResponse {
    data: Playlist[];
}

export interface PlaylistResponse {
    data: PlaylistWithTracks;
}

export interface CreatePlaylistPayload {
    name: string;
    description?: string;
    is_public?: boolean;
}

export interface UpdatePlaylistPayload {
    name?: string;
    description?: string;
    is_public?: boolean;
}

// ============================================
// СПИСОК ПЛЕЙЛИСТОВ
// ============================================

/**
 * Получить плейлисты текущего пользователя.
 *
 * GET /playlists
 */
export async function getPlaylists(): Promise<PlaylistsResponse> {
    const response = await http.get<PlaylistsResponse>(
        '/playlists',
    );

    return response.data;
}

// ============================================
// ОДИН ПЛЕЙЛИСТ
// ============================================

/**
 * Получить плейлист с треками.
 *
 * GET /playlists/{playlist}
 */
export async function getPlaylist(
    playlistId: number,
): Promise<PlaylistResponse> {
    const response = await http.get<PlaylistResponse>(
        `/playlists/${playlistId}`,
    );

    return response.data;
}

// ============================================
// СОЗДАНИЕ
// ============================================

/**
 * Создать плейлист.
 *
 * POST /playlists
 */
export async function createPlaylist(
    payload: CreatePlaylistPayload,
): Promise<PlaylistResponse> {
    const response = await http.post<PlaylistResponse>(
        '/playlists',
        {
            name: payload.name.trim(),
            ...(payload.description?.trim()
                ? { description: payload.description.trim() }
                : {}),
            ...(payload.is_public !== undefined
                ? { is_public: payload.is_public }
                : {}),
        },
    );

    return response.data;
}

// ============================================
// ОБНОВЛЕНИЕ
// ============================================

/**
 * Обновить название, описание или видимость плейлиста.
 *
 * PATCH /playlists/{playlist}
 */
export async function updatePlaylist(
    playlistId: number,
    payload: UpdatePlaylistPayload,
): Promise<PlaylistResponse> {
    const response = await http.patch<PlaylistResponse>(
        `/playlists/${playlistId}`,
        payload,
    );

    return response.data;
}

// ============================================
// УДАЛЕНИЕ
// ============================================

/**
 * Удалить плейлист.
 *
 * DELETE /playlists/{playlist}
 */
export async function deletePlaylist(
    playlistId: number,
): Promise<{ message: string }> {
    const response = await http.delete<{ message: string }>(
        `/playlists/${playlistId}`,
    );

    return response.data;
}

// ============================================
// ТРЕКИ ПЛЕЙЛИСТА
// ============================================

/**
 * Добавить трек в плейлист.
 *
 * POST /playlists/{playlist}/tracks
 */
export async function addTrackToPlaylist(
    playlistId: number,
    trackId: number,
): Promise<{ message: string }> {
    const response = await http.post<{ message: string }>(
        `/playlists/${playlistId}/tracks`,
        { track_id: trackId },
    );

    return response.data;
}

/**
 * Убрать трек из плейлиста.
 *
 * DELETE /playlists/{playlist}/tracks/{track}
 */
export async function removeTrackFromPlaylist(
    playlistId: number,
    trackId: number,
): Promise<{ message: string }> {
    const response = await http.delete<{ message: string }>(
        `/playlists/${playlistId}/tracks/${trackId}`,
    );

    return response.data;
}

// ============================================
// КЭШ СПИСКА ПЛЕЙЛИСТОВ
// ============================================

/*
 * Список плейлистов кэшируется, чтобы пункт меню
 * «Добавить в плейлист» не обращался к API при каждом
 * открытии. Вызывай invalidatePlaylistsCache() после
 * создания, изменения или удаления плейлиста,
 * а также при выходе пользователя из аккаунта.
 */

let playlistsCache: Playlist[] | null = null;

export async function getPlaylistsCached(): Promise<Playlist[]> {
    if (playlistsCache) {
        return playlistsCache;
    }

    const response = await getPlaylists();

    playlistsCache = response.data;

    return playlistsCache;
}

export function invalidatePlaylistsCache(): void {
    playlistsCache = null;
}
