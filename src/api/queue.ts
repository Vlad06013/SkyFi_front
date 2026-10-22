import { http } from '@/api/http';
import {Track} from "@/api/tracks";

export interface PlaybackQueueItem {
    id: number;
    playback_state_id: number;
    track_id: number;
    added_by_user_id: number | null;

    position: number;
    status: 'pending' | 'played';

    track: Track;
    added_by?: {
        id: number;
        name: string;
    } | null;

    created_at: string;
    updated_at: string;
}

export interface PlayerQueueResponse {
    data: PlaybackQueueItem[];
}

// ============================================
// ГЛОБАЛЬНЫЙ ПЛЕЕР: ОЧЕРЕДЬ
// ============================================

/**
 * Заполняет очередь треками выбранного источника.
 * Порядок trackIds определяет порядок воспроизведения.
 */
export async function fillPlayerQueue(
    trackIds: number[],
): Promise<PlayerQueueResponse> {
    const response = await http.put<PlayerQueueResponse>(
        '/player/queue',
        {
            track_ids: trackIds,
        },
    );

    return response.data;
}

/**
 * Получить очередь воспроизведения.
 *
 * GET /player/queue
 */
export async function getPlayerQueue(): Promise<PlayerQueueResponse> {
    const response = await http.get<PlayerQueueResponse>(
        '/player/queue',
    );

    return response.data;
}

/**
 * Добавить трек в очередь.
 *
 * POST /player/queue
 */
export async function addTrackToQueue(
    trackId: number,
): Promise<{
    message: string;
    item: PlaybackQueueItem;
}> {
    const response = await http.post(
        '/player/queue',
        {
            track_id: trackId,
        },
    );

    return response.data;
}

/**
 * Удалить ожидающий трек из очереди.
 *
 * DELETE /player/queue/{queueItemId}
 */
export async function removeTrackFromQueue(
    queueItemId: number,
): Promise<{
    message: string;
}> {
    const response = await http.delete(
        `/player/queue/${queueItemId}`,
    );

    return response.data;
}

/**
 * Изменить порядок треков в очереди.
 *
 * Передаём ID элементов очереди в нужном порядке.
 *
 * PATCH /player/queue/reorder
 */
export async function reorderPlayerQueue(
    itemIds: number[],
): Promise<PlayerQueueResponse & {
    message: string;
}> {
    const response = await http.patch(
        '/player/queue/reorder',
        {
            items: itemIds,
        },
    );

    return response.data;
}