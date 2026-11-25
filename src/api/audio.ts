import { http } from '@/api/http';
import type { AnySnapshot } from '@/types';

/** Временная ссылка на поток (api.md §7): ссылку не хранить — запрашивать заново по снапшоту. */
export function fetchAudioUrl(snapshot: AnySnapshot, signal?: AbortSignal) {
  return http.post<{ url: string; ttlSec: number }>('audio/get-url', snapshot, signal ? { signal } : undefined);
}

/**
 * Файл трека целиком: POST /audio/file, тело — снапшот, ответ — байты.
 * Бэк ставит Content-Length, поэтому onDownloadProgress видит total и даёт процент.
 */
export async function fetchAudioFile(
  snapshot: AnySnapshot,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const bytes = await http.postBytes('audio/file', snapshot, {
    signal,
    timeout: 180_000,
    onDownloadProgress: (event) => {
      // Стрим с Content-Length: loaded растёт по чанкам, total известен сразу.
      const total = event.total ?? 0;
      if (total > 0) onProgress?.(event.loaded, total);
      else if (typeof event.progress === 'number') onProgress?.(event.progress, 1);
    },
  });
  if (!bytes?.byteLength) throw new Error('Пустой файл');
  return bytes;
}
