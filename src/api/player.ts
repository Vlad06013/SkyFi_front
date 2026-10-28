import {http} from '@/api/http';
import {ApiResponse, PlayerActionResponse, PlayerStateResponse} from '@/types/TypeApiRespone'
import {AudioFile, type Track} from '@/types/TrackType'
import {PlayerDevice, PlayerDeviceType} from '@/types/PlayerType'

export type RepeatMode = 'off' | 'all' | 'one';

/**
 * Выбрать трек и установить состояние воспроизведения.
 *
 * POST /player/play
 */
export async function playRemoteTrack(
    track: Track,
    playbackSource?: string,
    meta?: {
        origin_device_id: number | null;
        command_id: string;
    },
): Promise<ApiResponse<PlayerStateResponse>> {
    const response = (
        await http.post<ApiResponse<PlayerStateResponse>>(
            '/player/play',
            {
                track,
                playback_source: playbackSource,
                ...meta,
            },
        )
    ).data;

    return response.data;
}

/**
 * Получить состояние плеера и очередь.
 *
 * GET /player
 */
export async function getPlayerState(): Promise<PlayerStateResponse> {
    const response = (await http.get<ApiResponse<PlayerStateResponse>>(
        '/player',
    )).data;

    return response.data;
}

export async function getTrackAudio(
    trackId: number,
): Promise<ApiResponse<AudioFile>> {
    const response = (await http.get<ApiResponse<AudioFile>>(
        `/tracks/${trackId}/audio`,
    )).data;

    const result = response.data;

    if (!result?.url) {
        throw new Error(
            'API не вернул ссылку на аудиофайл',
        );
    }

    return response.data;
}


export function downloadTrackAudio(
    trackId: number,
): string {
    return `${import.meta.env.VITE_API_URL}tracks/${trackId}/download`;
}

/**
 * Поставить воспроизведение на паузу.
 *
 * POST /player/pause
 */
export async function pauseRemotePlayback(
    positionSeconds: number,
    meta?: {
        origin_device_id: number | null;
        command_id: string;
    },
): Promise<ApiResponse<PlayerStateResponse>> {
    const response = (await http.post<ApiResponse<PlayerStateResponse>>(
        '/player/pause',
        {
            position_seconds: Math.max(
                0,
                Math.floor(positionSeconds),
            ),
            ...meta,
        },
    )).data;

    return response.data;
}

/**
 * Продолжить воспроизведение.
 *
 * POST /player/resume
 */
export async function resumeRemotePlayback(
    meta?: {
        origin_device_id: number | null;
        command_id: string;
    },
): Promise<ApiResponse<PlayerStateResponse>> {
    const response = (await http.post<ApiResponse<PlayerStateResponse>>(
        '/player/resume',
        {
            ...meta,
        },
    )).data;

    return response.data;
}

/**
 * Сохранить позицию воспроизведения.
 *
 * POST /player/seek
 */
export async function seekRemotePlayback(
    positionSeconds: number,
    meta?: {
        origin_device_id: number | null;
        command_id: string;
    },
): Promise<ApiResponse<PlayerStateResponse>> {
    const response = (await http.post<ApiResponse<PlayerStateResponse>>(
        '/player/seek',
        {
            position_seconds: Math.max(
                0,
                Math.floor(positionSeconds),
            ),
            ...meta,
        },
    )).data;

    return response.data;
}

/**
 * Переключить на следующий трек.
 *
 * POST /player/next
 */
export async function nextRemoteTrack(
    reason: 'manual' | 'ended' = 'manual',
    meta?: {
        origin_device_id: number | null;
        command_id: string;
    },
): Promise<ApiResponse<PlayerStateResponse>> {
    const response = (await http.post<ApiResponse<PlayerStateResponse>>(
        '/player/next',
        {
            reason,
            ...meta,
        },
    )).data;

    return response.data;
}


/**
 * Переключить на предыдущий трек.
 *
 * POST /player/previous
 */
export async function previousRemoteTrack(
    meta?: {
        origin_device_id: number | null;
        command_id: string;
    },
): Promise<ApiResponse<PlayerStateResponse>> {
    const response = (await http.post<ApiResponse<PlayerStateResponse>>(
        '/player/previous',
        {
            ...meta
        },
    )).data;

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
    meta?: {
        origin_device_id: number | null;
        command_id: string;
    },
): Promise<PlayerActionResponse> {
    const response = (await http.patch(
        `/player/devices/${deviceId}/activate`, {
            ...meta
        }
    )).data;

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


export async function updatePlaybackOptions(
    options: {
        repeat_mode?: RepeatMode;
        shuffle_enabled?: boolean;
    },
    meta?: {
        origin_device_id: number | null;
        command_id: string;
    },
): Promise<ApiResponse<PlayerStateResponse>> {

    const response = (await http.patch<ApiResponse<PlayerStateResponse>>(
        '/player/options', {
            options,
            ...meta
        }
    )).data;

    return response.data;
}


