import { http } from '@/api/http';
import type { TrackSnapshot, VideoSnapshot } from '@/types';

export interface VideoStream {
  quality: number;
  url: string;
}

export interface VideoStreamsPayload {
  streams: VideoStream[];
  ttl_sec: number;
}

/** Резолв «трек → видео» (api.md §8): video null — клипа нет, остаёмся на аудио. */
export interface ResolveVideoPayload {
  video: VideoSnapshot | null;
  streams: VideoStream[];
  ttl_sec: number;
}

/** Режим клипов для трека: матчинг на бэке, видео + свежие потоки одним запросом. */
export function resolveVideo(snapshot: TrackSnapshot, signal?: AbortSignal) {
  return http.post<ResolveVideoPayload>('videos/resolve', snapshot, signal ? { signal } : undefined);
}

/** Временные потоки видео (api.md §8): ссылки не хранить — TTL, запрашивать заново по снапшоту. */
export function fetchVideoStreams(snapshot: VideoSnapshot, signal?: AbortSignal) {
  return http.post<VideoStreamsPayload>('videos/get-url', snapshot, signal ? { signal } : undefined);
}
