import { http } from '@/api/http';
import { PlaybackQueueItem } from '@/api/queue';


// ============================================
// АУДИОФАЙЛ ТРЕКА
// ============================================

/**
 * Получить ссылку на аудиофайл трека.
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
        throw new Error(
            'API не вернул ссылку на аудиофайл',
        );
    }

    return result as AudioFile;
}

export function downloadTrackAudio(
    trackId: number,
): string {
    return `${import.meta.env.VITE_API_URL}tracks/${trackId}/download`;
}

// ============================================
// СПИСОК ТРЕКОВ
// ============================================

/**
 * Получить список опубликованных треков SkyFi.
 */
export async function getTracks(): Promise<TracksResponse> {
    const response = await http.get<TracksResponse>(
        '/tracks',
    );

    return response.data;
}



// ============================================
// ГЛОБАЛЬНЫЙ ПЛЕЕР: ТИПЫ
// ============================================

export type PlayerDeviceType =
    | 'phone'
    | 'computer'
    | 'car'
    | 'tv';

export interface PlayerDevice {
    id: number;
    user_id: number;
    device_uuid: string;
    name: string;
    type: PlayerDeviceType;
    is_active: boolean;
    last_seen_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface PlaybackState {
    id: number;
    user_id: number;

    current_track_id: number | null;
    /** Трек основного списка, к которому нужно вернуться после серверной очереди. */
    last_source_track_id: number | null;
    active_device_id: number | null;

    position_seconds: number;
    is_playing: boolean;

    repeat_mode: 'off' | 'all' | 'one';
    shuffle_enabled: boolean;

    version: number;

    current_track?: Track | null;
    active_device?: PlayerDevice | null;

    created_at: string;
    updated_at: string;
}
// export interface PlaybackQueueItem {
//     id: number;
//     playback_state_id: number;
//     track_id: number;
//     added_by_user_id: number | null;
//
//     position: number;
//     status: 'pending' | 'played';
//
//     track: Track;
//     added_by?: {
//         id: number;
//         name: string;
//     } | null;
//
//     created_at: string;
//     updated_at: string;
// }

export interface PlayerStateResponse {
    state: PlaybackState;
    queue: PlaybackQueueItem[];
}

export interface PlayerActionResponse {
    message: string;
    state: PlaybackState;
}

// export interface PlayerQueueResponse {
//     data: PlaybackQueueItem[];
// }

// ============================================
// ГЛОБАЛЬНЫЙ ПЛЕЕР: СОСТОЯНИЕ
// ============================================

/**
 * Получить состояние плеера и очередь.
 *
 * GET /player
 */
export async function getPlayerState(): Promise<PlayerStateResponse> {
    const response = await http.get<PlayerStateResponse>(
        '/player',
    );

    return response.data;
}

// ============================================
// ГЛОБАЛЬНЫЙ ПЛЕЕР: ВОСПРОИЗВЕДЕНИЕ
// ============================================

/**
 * Выбрать трек и установить состояние воспроизведения.
 *
 * POST /player/play
 */
export async function playRemoteTrack(
    trackId: number,
    deviceId?: number,
): Promise<PlayerActionResponse> {
    const response = await http.post<PlayerActionResponse>(
        '/player/play',
        {
            track_id: trackId,
            ...(deviceId != null
                ? { device_id: deviceId }
                : {}),
        },
    );

    return response.data;
}

/**
 * Поставить воспроизведение на паузу.
 *
 * POST /player/pause
 */
export async function pauseRemotePlayback(
    positionSeconds: number,
): Promise<PlayerActionResponse> {
    const response = await http.post<PlayerActionResponse>(
        '/player/pause',
        {
            position_seconds: Math.max(
                0,
                Math.floor(positionSeconds),
            ),
        },
    );

    return response.data;
}

/**
 * Продолжить воспроизведение.
 *
 * POST /player/resume
 */
export async function resumeRemotePlayback(): Promise<PlayerActionResponse> {
    const response = await http.post<PlayerActionResponse>(
        '/player/resume',
    );

    return response.data;
}

/**
 * Сохранить позицию воспроизведения.
 *
 * POST /player/seek
 */
export async function seekRemotePlayback(
    positionSeconds: number,
): Promise<PlayerActionResponse> {
    const response = await http.post<PlayerActionResponse>(
        '/player/seek',
        {
            position_seconds: Math.max(
                0,
                Math.floor(positionSeconds),
            ),
        },
    );

    return response.data;
}

/**
 * Переключить на следующий трек.
 *
 * POST /player/next
 */
export async function nextRemoteTrack(
    reason: 'manual' | 'ended' = 'manual',
): Promise<PlayerActionResponse> {
    const response = await http.post<PlayerActionResponse>(
        '/player/next',
        { reason },
    );

    return response.data;
}

/**
 * Переключить на предыдущий трек.
 *
 * POST /player/previous
 */
export async function previousRemoteTrack(): Promise<PlayerActionResponse> {
    const response = await http.post<PlayerActionResponse>(
        '/player/previous',
    );

    return response.data;
}


// ============================================
// ГЛОБАЛЬНЫЙ ПЛЕЕР: УСТРОЙСТВА
// ============================================

/**
 * Получить список зарегистрированных устройств.
 *
 * GET /player/devices
 */
export async function getPlayerDevices(): Promise<{
    data: PlayerDevice[];
}> {
    const response = await http.get<{
        data: PlayerDevice[];
    }>('/player/devices');

    return response.data;
}

/**
 * Зарегистрировать устройство.
 *
 * POST /player/devices
 */
export async function registerPlayerDevice(
    device: {
        device_uuid: string;
        name: string;
        type: PlayerDeviceType;
    },
): Promise<{
    message: string;
    device: PlayerDevice;
}> {
    const response = await http.post(
        '/player/devices',
        device,
    );

    return response.data;
}

/**
 * Выбрать устройство воспроизведения.
 *
 * PATCH /player/devices/{deviceId}/activate
 */
export async function activatePlayerDevice(
    deviceId: number,
): Promise<PlayerActionResponse> {
    const response = await http.patch(
        `/player/devices/${deviceId}/activate`,
    );

    return response.data;
}

/**
 * Удалить зарегистрированное устройство.
 *
 * DELETE /player/devices/{deviceId}
 */
export async function deletePlayerDevice(
    deviceId: number,
): Promise<{
    message: string;
}> {
    const response = await http.delete(
        `/player/devices/${deviceId}`,
    );

    return response.data;
}

export type RepeatMode = 'off' | 'all' | 'one';

export async function updatePlaybackOptions(options: {
    repeat_mode?: RepeatMode;
    shuffle_enabled?: boolean;
}): Promise<PlayerActionResponse> {
    const response = await http.patch<PlayerActionResponse>(
        '/player/options',
        options,
    );

    return response.data;
}