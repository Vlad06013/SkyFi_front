import { http } from '@/api/http';
import {ApiResponse} from "@/types/TypeApiRespone";
import {PlaybackQueueItem} from "@/types/QueueType";
import {Track} from "@/types/TrackType";

/**
 * Единая обёртка ответа очереди: data — вся очередь целиком.
 */
type QueueListResponse = ApiResponse<PlaybackQueueItem[]>;

/**
 * Получить очередь воспроизведения.
 *
 * GET /player/queue
 */
export async function getPlayerQueue(): Promise<PlaybackQueueItem[]> {
    const response = await http.get<QueueListResponse>(
        '/player/queue',
    );

    return response.data.data;
}

/**
 * Добавить трек в очередь.
 *
 * Трек может быть локальным или внешним (поиск):
 * бэкенд сам найдёт его по ID + источнику либо создаст.
 * Возвращает очередь целиком после добавления.
 *
 * POST /player/queue
 */
export async function addTrackToQueue(
    track: Track,
): Promise<PlaybackQueueItem[]> {
    const response = await http.post<QueueListResponse>(
        '/player/queue',
        track,
    );

    return response.data.data;
}

/**
 * Удалить ожидающий трек из очереди.
 * Возвращает очередь целиком после удаления.
 *
 * DELETE /player/queue/{queueItemId}
 */
export async function removeTrackFromQueue(
    queueItemId: number,
): Promise<PlaybackQueueItem[]> {
    const response = await http.delete<QueueListResponse>(
        `/player/queue/${queueItemId}`,
    );

    return response.data.data;
}

/**
 * Изменить порядок треков в очереди.
 *
 * Передаём ID элементов очереди в нужном порядке.
 * Возвращает очередь целиком после перестановки.
 *
 * PATCH /player/queue/reorder
 */
export async function reorderPlayerQueue(
    itemIds: number[],
): Promise<PlaybackQueueItem[]> {
    const response = await http.patch<QueueListResponse>(
        '/player/queue/reorder',
        {
            items: itemIds,
        },
    );

    return response.data.data;
}
