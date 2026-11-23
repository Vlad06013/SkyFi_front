import { http } from '@/api/http';
import type { AnySnapshot } from '@/types';

/** Временная ссылка на поток (api.md §7): ссылку не хранить — запрашивать заново по снапшоту. */
export function fetchAudioUrl(snapshot: AnySnapshot, signal?: AbortSignal) {
  return http.post<{ url: string; ttlSec: number }>('audio/get-url', snapshot, signal ? { signal } : undefined);
}
