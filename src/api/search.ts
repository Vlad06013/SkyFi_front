import { http } from '@/api/http';
import type { SearchPagePayload, SearchSourcePagePayload, SnapshotSource } from '@/types';

export interface SearchParams {
  q: string;
  limit?: number;
  page?: number;
}

/** Поиск по каталогам (api.md §9). q 2–100 символов, может быть ссылкой на сущность Яндекса. */
export function fetchSearch(params: SearchParams, signal?: AbortSignal) {
  return http.get<SearchPagePayload>('search', signal ? { params, signal } : { params });
}

export type SearchWireSection = 'tracks' | 'albums' | 'artists' | 'playlists' | 'videos';

export interface SearchV2Params {
  q: string;
  resource: SnapshotSource;
  type: 'audio' | 'video';
  /** Нет — ответ со всеми секциями источника. У Яндекса так приходит best. */
  section?: SearchWireSection;
  limit?: number;
  page?: number;
}

/** Один источник на запрос (api.md §9.1). */
export function fetchSearchV2(params: SearchV2Params, signal?: AbortSignal) {
  return http.get<SearchSourcePagePayload>('search/v2', signal ? { params, signal } : { params });
}
