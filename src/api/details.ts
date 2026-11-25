import { http } from '@/api/http';
import type { EntityDetailsPayload, SnapshotSource } from '@/types';

export type DetailsEntityType = 'album' | 'artist' | 'playlist';

/** Конверта снапшота достаточно: бэк резолвит сущность по паре источника (api.md §11). */
export interface DetailsRequestSnapshot {
  type: DetailsEntityType;
  source_type: SnapshotSource;
  source_id: string;
}

export interface DetailsParams {
  page?: number;
  limit?: number;
}

/** Детали album/artist/playlist (api.md §11, POST /details) + пагинация треков. */
export function fetchEntityDetails(
  snapshot: DetailsRequestSnapshot,
  params: DetailsParams = {},
  signal?: AbortSignal,
) {
  return http.post<EntityDetailsPayload>(
    'details',
    { ...snapshot, ...params },
    signal ? { signal } : undefined,
  );
}
