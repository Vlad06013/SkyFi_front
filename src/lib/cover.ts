import { ref } from 'vue';
import { resolveUrl } from '@/lib/endpoints';
import { entityKey } from '@/lib/download-keys';
import type { AnySnapshot, SnapshotSource, TrackSnapshot } from '@/types';

const localCovers = new Map<string, string>();
/** Счётчик, чтобы шаблоны перерисовались, когда локальная обложка доехала. */
const localCoverVersion = ref(0);

export function setLocalCover(key: string, url: string) {
  const prev = localCovers.get(key);
  // Та же обложка уже опубликована (повторная загрузка, hydrate) —
  // без бампа версии: иначе каждый прогон перерисовывал все списки.
  if (prev === url) return;
  if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
  localCovers.set(key, url);
  localCoverVersion.value += 1;
}

export function clearLocalCover(key: string) {
  const prev = localCovers.get(key);
  if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
  localCovers.delete(key);
  localCoverVersion.value += 1;
}

function localCover(key: string): string {
  return localCovers.get(key) ?? '';
}

export function coverVar(source: SnapshotSource): string {
  if (source === 'yandex_music') return 'var(--gradient-cover-1)';
  if (source === 'dzen' || source === 'youtube') return 'var(--gradient-cover-3)';
  return 'var(--gradient-cover-2)';
}

/**
 * Размер обложки Яндекса — последний сегмент пути (200x200, 600x600, orig…).
 * Бэк шлёт 200x200, CDN отдаёт любой размер по тому же пути. Хост не один:
 * сейчас это music-avatars.music.yandex.net, раньше avatars.yandex.net и
 * avatars.mds.yandex.net. Берём любой *.yandex.net с сегментом размера
 * (проверено curl'ом 2026-11-27: 1000x1000 на music-avatars — JPEG ~300 КБ).
 * Чужие хосты и пути без размера не трогаем.
 */
export function coverSize(url: string, size: number): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('.yandex.net')) return url;
    if (!/\/(\d+x\d+|orig)$/.test(parsed.pathname)) return url;
    parsed.pathname = parsed.pathname.replace(/\/(\d+x\d+|orig)$/, `/${size}x${size}`);
    return parsed.toString();
  } catch {
    return url;
  }
}

function sized(url: string | null | undefined, size?: number): string {
  const resolved = resolveUrl(url);
  return size ? coverSize(resolved, size) : resolved;
}

/** Обложка трека: скачанный файл, своё поле, затем обложка альбома. */
export function trackCover(track: TrackSnapshot, size?: number): string {
  void localCoverVersion.value;
  const own = localCover(entityKey(track));
  if (own) return own;
  if (track.cover_url) return sized(track.cover_url, size);
  if (track.album?.source_id) {
    const album = localCover(`album:${track.source_type}:${track.album.source_id}`);
    if (album) return album;
  }
  return sized(track.album?.cover_url, size);
}

/** Обложка снапшота: скачанный файл, иначе ссылка с сервера. */
export function snapshotCover(snapshot: AnySnapshot, size?: number): string {
  void localCoverVersion.value;
  if (snapshot.type === 'track') return trackCover(snapshot, size);
  return localCover(entityKey(snapshot)) || sized(snapshot.cover_url, size);
}

export function sourceTitle(source: SnapshotSource): string {
  if (source === 'yandex_music') return 'Яндекс';
  if (source === 'upload') return 'Файл';
  if (source === 'dzen') return 'Дзен';
  if (source === 'youtube') return 'YouTube';
  return 'SkyFi';
}

export function artistsLine(artists: { name: string }[] | null | undefined): string {
  // Бэк не шлёт artists у artist-снапшотов (проверено curl'ом, api.md §9).
  return (artists ?? []).map((a) => a.name).join(', ');
}
