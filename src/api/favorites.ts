import { http } from '@/api/http';
import type { AnySnapshot, FavoritesPayload, SnapshotType } from '@/types';

/** Все вкладки избранного одной загрузкой (api.md §10). */
export function fetchFavorites() {
  return http.get<FavoritesPayload>('favorites');
}

/** Лайк = upsert по тройке (type, source_type, source_id); повтор — no-op. */
export function addFavorite(snapshot: AnySnapshot) {
  return http.post<{ message: string; is_favorite: boolean }>('favorites', snapshot);
}

/** Снапшот в теле, не в query (api.md §10). */
export function removeFavorite(snapshot: AnySnapshot) {
  return http.delete<{ message: string }>('favorites', { data: snapshot });
}

/** Перенос одного элемента вкладки на позицию: бэк переписывает только затронутый диапазон весов (api.md §10). */
export function moveFavorite(type: SnapshotType, item: { source_type: string; source_id: string }, toIndex: number) {
  return http.patch('favorites/sort', { type, item, to_index: toIndex });
}
