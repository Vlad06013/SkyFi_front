import { http } from '@/api/http';
import type { VideoSnapshot } from '@/types';

export interface VideoStream {
  quality: number;
  url: string;
}

export interface VideoStreamsPayload {
  streams: VideoStream[];
  ttl_sec: number;
}

/** Временные потоки видео (api.md §8): ссылки не хранить — TTL, запрашивать заново по снапшоту. */
export function fetchVideoStreams(snapshot: VideoSnapshot, signal?: AbortSignal) {
  return http.post<VideoStreamsPayload>('videos/get-url', snapshot, signal ? { signal } : undefined);
}
