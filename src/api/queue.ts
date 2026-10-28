import { http } from '@/api/http';
import {ApiResponse} from "@/types/TypeApiRespone";
import {PlaybackQueueItem} from "@/types/QueueType";


/**
 * Получить очередь воспроизведения.
 *
 * GET /player/queue
 */
export async function getPlayerQueue(): Promise<PlaybackQueueItem> {
    // const response = await http.get<PlayerQueueResponse>(
    //     '/player/queue',
    // );
    const response = (await http.get<ApiResponse<PlaybackQueueItem>>(
        '/player/queue',
    )).data;

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
): Promise<PlaybackQueueItem & {
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