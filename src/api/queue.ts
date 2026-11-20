import { http } from '@/api/http';
import type { AnySnapshot, QueueItem } from '@/types';

/** Эндпоинты очереди возвращают очередь целиком (api.md §6). */
type QueuePayload = QueueItem[];

/** Очередь целиком (api.md §6, GET /player/queue). */
export function fetchQueue() {
  return http.get<QueuePayload>('player/queue');
}

/** Добавление в конец: тело — плоский конверт любого типа (api.md §6). */
export function addToQueue(snapshot: AnySnapshot) {
  return http.post<QueuePayload>('player/queue', snapshot);
}

/** Удаление элемента (api.md §6, DELETE /player/queue/{id}). */
export function removeFromQueue(id: number) {
  return http.delete<QueuePayload>(`player/queue/${id}`);
}

/** Перестановка id ожидающих элементов в новом порядке (api.md §6, PATCH /player/queue/reorder). */
export function reorderPending(items: number[]) {
  return http.patch<QueuePayload>('player/queue/reorder', { items });
}
