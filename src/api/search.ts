import { http } from '@/api/http';
import type { SearchPagePayload } from '@/types';

export interface SearchParams {
  q: string;
  limit?: number;
  page?: number;
}

/** Поиск по каталогам (api.md §9). q 2–100 символов, может быть ссылкой на сущность Яндекса. */
export function fetchSearch(params: SearchParams, signal?: AbortSignal) {
  return http.get<SearchPagePayload>('search', signal ? { params, signal } : { params });
}
