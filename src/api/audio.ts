import { http } from '@/api/http';
import type { AnySnapshot } from '@/types';

/** Временная ссылка на поток (api.md §7): ссылку не хранить — запрашивать заново по снапшоту. */
export function fetchAudioUrl(snapshot: AnySnapshot, signal?: AbortSignal) {
  return http.post<{ url: string; ttlSec: number }>('audio/get-url', snapshot, signal ? { signal } : undefined);
}

/**
 * Стрим встал посреди тела: байты не текут дольше этого срока. Бэк проксирует
 * файл из Яндекса, и прокси иногда замирает — процент стоял до общего
 * таймаута 180 с (журнал 2026-11-26: 66% на 40+ с при живом health).
 */
export const AUDIO_STALL_TIMEOUT_MS = 30_000;

/**
 * Файл трека целиком: POST /audio/file, тело — снапшот, ответ — байты.
 * Бэк ставит Content-Length, поэтому onDownloadProgress видит total и даёт процент.
 * Сталл (нет байтов AUDIO_STALL_TIMEOUT_MS) — обрыв и одна повторная попытка.
 */
export async function fetchAudioFile(
  snapshot: AnySnapshot,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const stall = new AbortController();
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    // Тишина в эфире — и до первого байта тоже: зависший коннект рвём так же.
    const armStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => stall.abort(), AUDIO_STALL_TIMEOUT_MS);
    };
    const onUserAbort = () => stall.abort();
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    signal?.addEventListener('abort', onUserAbort);
    armStall();
    try {
      const bytes = await http.postBytes('audio/file', snapshot, {
        signal: stall.signal,
        timeout: 180_000,
        onDownloadProgress: (event) => {
          armStall();
          // Стрим с Content-Length: loaded растёт по чанкам, total известен сразу.
          const total = event.total ?? 0;
          if (total > 0) onProgress?.(event.loaded, total);
          else if (typeof event.progress === 'number') onProgress?.(event.progress, 1);
        },
      });
      if (!bytes?.byteLength) throw new Error('Пустой файл');
      return bytes;
    } catch (error) {
      // Отмена пользователем — не сталл, наружу как есть (её ждёт isDownloadAbort).
      if (signal?.aborted) throw error;
      if (!stall.signal.aborted) throw error;
      if (attempt === 1) throw new Error('Сервер перестал отдавать файл. Попробуйте ещё раз.');
      // Сталл — вторая попытка с чистого листа.
    } finally {
      if (stallTimer) clearTimeout(stallTimer);
      signal?.removeEventListener('abort', onUserAbort);
    }
  }
  throw new Error('unreachable');
}
