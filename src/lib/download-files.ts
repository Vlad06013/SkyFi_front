import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { deleteDownloadFile, readDownloadFile, saveDownloadFile } from '@/lib/download-db';
import { getSession } from '@/lib/session';

const playable = new Map<string, string>();

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const size = 0x2000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

/** Байты в папку приложения. На Android это Directory.External, без отдельных разрешений. */
export async function writeDownload(path: string, data: ArrayBuffer, mime: string): Promise<void> {
  forgetPlayable(path);
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path,
      data: toBase64(data),
      directory: Directory.External,
      recursive: true,
    });
    return;
  }
  await saveDownloadFile({ path, data, mime });
}

export async function removeDownload(path: string): Promise<void> {
  forgetPlayable(path);
  if (Capacitor.isNativePlatform()) {
    await Filesystem.deleteFile({ path, directory: Directory.External }).catch(() => undefined);
    return;
  }
  await deleteDownloadFile(path);
}

/** URL, который можно поставить в audio/img. null — файла нет. */
export async function openDownload(path: string, mime: string): Promise<string | null> {
  const cached = playable.get(path);
  if (cached) return cached;
  if (Capacitor.isNativePlatform()) {
    try {
      const { uri } = await Filesystem.getUri({ path, directory: Directory.External });
      const src = Capacitor.convertFileSrc(uri);
      playable.set(path, src);
      return src;
    } catch {
      return null;
    }
  }
  const row = await readDownloadFile(path);
  if (!row?.data) return null;
  const url = URL.createObjectURL(new Blob([row.data], { type: row.mime || mime }));
  playable.set(path, url);
  return url;
}

/**
 * Трек целиком в файл (POST снапшотом, api.md §7). На телефоне шлём
 * CapacitorHttp: нативный стек вне пула соединений WebView (XHR-закачка
 * десятков мегабайт встаёт в общую очередь и глушит зонд, heartbeat и API —
 * приложение уходило в офлайн ровно на время скачивания). Filesystem
 * .downloadFile здесь не подходит: в его нативном коде тело запроса не
 * пишется вообще (поля data нет), POST уходил пустым и бэк отвечал 422.
 * Во временный `.part`: обрыв не оставляет файл, который стор считал бы
 * скачанным. Прогресс по байтам плагин не шлёт — отчёт одним финальным
 * вызовом. Отмена по signal не рвёт нативный запрос (плагин не умеет):
 * файл докачивается фоном и выбрасывается.
 * @returns размер сохранённого файла в байтах.
 */
export async function downloadTrackFile(
  url: string,
  data: unknown,
  path: string,
  signal: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<number> {
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  const stored = await getSession();
  const part = `${path}.part`;
  try {
    const response = await CapacitorHttp.request({
      method: 'POST',
      url,
      data,
      headers: {
        'Content-Type': 'application/json',
        ...(stored?.token ? { Authorization: `Bearer ${stored.token}` } : {}),
      },
      responseType: 'arraybuffer',
    });
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}: ${errorBodyText(response.data)}`);
    }
    // Нативно arraybuffer возвращается base64-строкой — прямо в writeFile.
    await Filesystem.writeFile({
      path: part,
      data: response.data as string,
      directory: Directory.External,
      recursive: true,
    });
    await Filesystem.rename({ from: part, to: path, directory: Directory.External, toDirectory: Directory.External });
    forgetPlayable(path);
    const size = (await Filesystem.stat({ path, directory: Directory.External })).size;
    onProgress?.(size, size);
    return size;
  } catch (cause) {
    await Filesystem.deleteFile({ path: part, directory: Directory.External }).catch(() => undefined);
    throw cause;
  }
}

/** Тело не-2xx ответа в текст: Laravel 422 кладёт ошибки валидации в JSON. */
function errorBodyText(data: unknown): string {
  try {
    const text =
      typeof data === 'string'
        ? new TextDecoder().decode(Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0)))
        : JSON.stringify(data);
    const parsed = JSON.parse(text) as { message?: string; errors?: Record<string, string[]> };
    const fields = parsed.errors
      ? Object.entries(parsed.errors)
          .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
          .join('; ')
      : '';
    return `${parsed.message ?? ''} ${fields}`.trim().slice(0, 300) || text.slice(0, 300);
  } catch {
    return String(data).slice(0, 300);
  }
}

/** Обложка по прямой ссылке. На телефоне — нативный GET, CORS Яндекса его не режет. */export async function saveCoverFromUrl(url: string, path: string, signal: AbortSignal): Promise<string | null> {
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  if (Capacitor.isNativePlatform()) {
    await Filesystem.downloadFile({
      url,
      path,
      directory: Directory.External,
      recursive: true,
    });
    if (signal.aborted) {
      await removeDownload(path);
      throw new DOMException('aborted', 'AbortError');
    }
    return 'image/jpeg';
  }
  const response = await fetch(url, { signal });
  if (!response.ok) return null;
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
  const data = await response.arrayBuffer();
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  await writeDownload(path, data, mime);
  return mime;
}

export function isLocalPlaybackUrl(url: string): boolean {
  for (const src of playable.values()) {
    if (src === url) return true;
  }
  return false;
}

function forgetPlayable(path: string) {
  const prev = playable.get(path);
  if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
  playable.delete(path);
}
