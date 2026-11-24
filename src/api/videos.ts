import { http } from '@/api/http';
import type { TrackSnapshot, VideoSnapshot, YoutubeCookiesStatusPayload } from '@/types';

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

/** Статус привязки cookies YouTube (api.md §8). */
export function fetchYoutubeCookiesStatus() {
  return http.get<YoutubeCookiesStatusPayload>('videos/youtube-cookies');
}

/**
 * Привязка cookies YouTube (api.md §8): multipart, поле cookies — Netscape .txt
 * с youtube.com (расширение «Get cookies.txt LOCALLY»). Тело ответа в контракте
 * не зафиксировано — состояние после загрузки добираем GET'ом.
 */
export function uploadYoutubeCookies(file: File) {
  const form = new FormData();
  form.append('cookies', file);
  return http.post<unknown>('videos/youtube-cookies', form);
}

/** Отвязать cookies YouTube (api.md §8). */
export function deleteYoutubeCookies() {
  return http.delete<unknown>('videos/youtube-cookies');
}
