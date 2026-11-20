import { http } from '@/api/http';
import type { AnySnapshot } from '@/types';

/** data ответа POST /share-url (api.md §13): публичная ссылка источника.
 *  В contracts.md форма не зафиксирована — по описанию api.md ({url}). */
export interface ShareUrlPayload {
  url: string;
}

/** Элемент «поделились со мной» (api.md §13, GET /shares).
 *  Форма с провода 2026-11-20: sender без avatar_url, snapshot полный. */
export interface ShareItem {
  id: number;
  sender: { id: number; name: string };
  snapshot: AnySnapshot;
  created_at: string;
}

/** Публичная ссылка источника по снапшоту (api.md §13, POST /share-url).
 *  У видео — watch_url, если есть. Ссылку не храним: запрашиваем заново. */
export function fetchShareUrl(snapshot: AnySnapshot) {
  return http.post<ShareUrlPayload>('share-url', snapshot);
}

/** Список «поделились со мной» (api.md §13, GET /shares). */
export function fetchShares() {
  return http.get<ShareItem[]>('shares');
}

/** Убрать из входящих (api.md §13, DELETE /shares/{share}). */
export function removeShare(id: number) {
  return http.delete<{ message: string }>(`shares/${id}`);
}
