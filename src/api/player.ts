import {http} from '@/api/http';
import {ApiResponse, PlayerActionResponse, PlayerStateResponse} from '@/types/TypeApiRespone'
import {AudioFile, type Track} from '@/types/TrackType'
import {PlayerDevice, PlayerDeviceType} from '@/types/PlayerType'
import {PlaySourceListsEnum} from '@/types/PlaySourceListsEnum'

export type RepeatMode = 'off' | 'all' | 'one';

/**
 * Выбрать трек и установить состояние воспроизведения.
 *
 * POST /player/play
 */
export async function playRemoteTrack(
    track: Track,
    playbackSource?: PlaySourceListsEnum,
    meta?: {
        origin_device_id: number | null;
        command_id: string;
    },
): Promise<PlayerStateResponse> {
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
): Promise<AudioFile> {
    // Яндекс может долго отдавать ссылку — даём минуту
    // вместо глобальных 15 секунд.
    const response = (await http.get<ApiResponse<AudioFile>>(
        `/tracks/${trackId}/audio`,
        {timeout: 60000},
    )).data;

    const result = response.data;

    if (!result?.url) {
        throw new Error(
            'API не вернул ссылку на аудиофайл',
        );
    }

    return result;
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
): Promise<PlayerStateResponse> {
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
): Promise<PlayerStateResponse> {
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
): Promise<PlayerStateResponse> {
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
 * Ответ: BaseResponseResource поверх PlayerDeviceResource —
 * поля устройства лежат в data напрямую.
 *
 * POST /player/devices
 */
export async function registerPlayerDevice(
    device: {
        name: string;
        type: PlayerDeviceType;
        origin_device_id: string;
        command_id: string;
    },
): Promise<PlayerDevice> {
    const response = await http.post<ApiResponse<PlayerDevice>>(
        '/player/devices',
        device,
    );

    return response.data.data;
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
 * Отметить устройство активным (heartbeat).
 *
 * POST /player/devices/heartbeat
 */
export async function sendPlayerHeartbeat(
    deviceUuid: string,
): Promise<void> {
    await http.post('/player/devices/heartbeat', {
        device_uuid: deviceUuid,
    });
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
): Promise<PlayerStateResponse> {

    const response = (await http.patch<ApiResponse<PlayerStateResponse>>(
        '/player/options', {
            options,
            ...meta
        }
    )).data;

    return response.data;
}


