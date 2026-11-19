import { http } from '@/api/http';
import type { SearchPagePayload } from '@/types';

export interface SearchParams {
  q: string;
  limit?: number;
  page?: number;
}

/** Поиск по каталогам (api.md §9). q 2–100 символов, может быть ссылкой на сущность Яндекса. */
export function fetchSearch(params: SearchParams) {
  return http.get<SearchPagePayload>('search', { params });
}
