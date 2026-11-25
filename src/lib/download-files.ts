import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { deleteDownloadFile, readDownloadFile, saveDownloadFile } from '@/lib/download-db';

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

/** Обложка по прямой ссылке. На телефоне — нативный GET, CORS Яндекса его не режет. */
export async function saveCoverFromUrl(url: string, path: string, signal: AbortSignal): Promise<string | null> {
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
