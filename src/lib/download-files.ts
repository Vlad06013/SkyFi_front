import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
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
 * Трек целиком в файл (POST снапшотом, api.md §7). На телефоне качает
 * нативный HTTP (OkHttp) — вне пула соединений WebView: XHR-закачка
 * десятков мегабайт встаёт в общую очередь и глушит зонд, heartbeat и API
 * (приложение уходило в офлайн ровно на время скачивания). Прогресс —
 * событием плагина. Во временный `.part`: обрыв не оставляет файл, который
 * стор считал бы скачанным. Отмена по signal не рвёт нативный запрос
 * (плагин не умеет): файл докачивается фоном и выбрасывается.
 */
export async function downloadTrackFile(
  url: string,
  data: unknown,
  path: string,
  signal: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  const stored = await getSession();
  let listener: PluginListenerHandle | null = null;
  if (onProgress) {
    listener = await Filesystem.addListener('progress', (event) => {
      if (event.url !== url) return;
      onProgress(event.bytes, event.contentLength);
    });
  }
  const part = `${path}.part`;
  try {
    await Filesystem.downloadFile({
      url,
      method: 'POST',
      // Строкой, а не объектом: плагин сериализует data по-своему и бэк
      // ловил 422 «The type field is required».
      data: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        ...(stored?.token ? { Authorization: `Bearer ${stored.token}` } : {}),
      },
      path: part,
      directory: Directory.External,
      recursive: true,
      progress: Boolean(onProgress),
    });
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    await Filesystem.rename({ from: part, to: path, directory: Directory.External, toDirectory: Directory.External });
    forgetPlayable(path);
  } catch (cause) {
    await Filesystem.deleteFile({ path: part, directory: Directory.External }).catch(() => undefined);
    throw cause;
  } finally {
    await listener?.remove();
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
