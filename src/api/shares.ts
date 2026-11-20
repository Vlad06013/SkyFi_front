import { http } from '@/api/http';
import type { AnySnapshot } from '@/types';

/** data ответа POST /share-url (api.md §13): публичная ссылка источника.
 *  В contracts.md форма не зафиксирована — по описанию api.md ({url}). */
export interface ShareUrlPayload {
  url: string;
}

/** Публичная ссылка источника по снапшоту (api.md §13, POST /share-url).
 *  У видео — watch_url, если есть. Ссылку не храним: запрашиваем заново. */
export function fetchShareUrl(snapshot: AnySnapshot) {
  return http.post<ShareUrlPayload>('share-url', snapshot);
}
