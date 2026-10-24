import { http } from '@/api/http';
import {PlayerActionResponse, PlayerStateResponse, TracksResponse} from '@/types/TypeApiRespone'
import {AudioFile} from '@/types/TrackType'
import {PlayerDevice, PlayerDeviceType} from '@/types/PlayerType'

export type RepeatMode = 'off' | 'all' | 'one';

/**
 * Выбрать трек и установить состояние воспроизведения.
 *
 * POST /player/play
 */
export async function playRemoteTrack(
    trackId: number,
    meta?: {
        origin_device_id: number | null;
        command_id: string;
    },
): Promise<PlayerActionResponse> {
    const response = await http.post<PlayerActionResponse>(
        '/player/play',
        {
            track_id: trackId,
            ...meta
        },
    );

    return response.data;
}

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
): Promise<PlayerActionResponse> {
    const response = await http.post<PlayerActionResponse>(
        '/player/pause',
        {
            position_seconds: Math.max(
                0,
                Math.floor(positionSeconds),
            ),
            ...meta,
        },
    );

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
): Promise<PlayerActionResponse> {
    const response = await http.post<PlayerActionResponse>(
        '/player/resume',
        {
            ...meta,
        }
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
    meta?: {
        origin_device_id: number | null;
        command_id: string;
    },
): Promise<PlayerActionResponse> {
    const response = await http.post<PlayerActionResponse>(
        '/player/seek',
        {
            position_seconds: Math.max(
                0,
                Math.floor(positionSeconds),
            ),
            ...meta,
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
    meta?: {
        origin_device_id: number | null;
        command_id: string;
    },
): Promise<PlayerActionResponse> {
    const response = await http.post<PlayerActionResponse>(
        '/player/next',
        {
            reason,
            ...meta

        },
    );

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
): Promise<PlayerActionResponse> {
    const response = await http.post<PlayerActionResponse>(
        '/player/previous',
        {
            ...meta
        },
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
    meta?: {
        origin_device_id: number | null;
        command_id: string;
    },
): Promise<PlayerActionResponse> {
    const response = await http.patch(
        `/player/devices/${deviceId}/activate`,{
            ... meta
        }
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

//TODO: Удалить
export async function getTracks(): Promise<TracksResponse> {
    const response = await http.get<TracksResponse>(
        '/tracks',
    );

    return response.data;
}
