import { ref } from 'vue';
import { resolveUrl } from '@/lib/endpoints';
import { entityKey } from '@/lib/download-keys';
import type { AnySnapshot, SnapshotSource, TrackSnapshot } from '@/types';

const localCovers = new Map<string, string>();
/** Счётчик, чтобы шаблоны перерисовались, когда локальная обложка доехала. */
const localCoverVersion = ref(0);

export function setLocalCover(key: string, url: string) {
  const prev = localCovers.get(key);
  if (prev && prev !== url && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
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

/** Обложка трека: скачанный файл, своё поле, затем обложка альбома. */
export function trackCover(track: TrackSnapshot): string {
  void localCoverVersion.value;
  const own = localCover(entityKey(track));
  if (own) return own;
  if (track.cover_url) return resolveUrl(track.cover_url);
  if (track.album?.source_id) {
    const album = localCover(`album:${track.source_type}:${track.album.source_id}`);
    if (album) return album;
  }
  return resolveUrl(track.album?.cover_url);
}

/** Обложка снапшота: скачанный файл, иначе ссылка с сервера. */
export function snapshotCover(snapshot: AnySnapshot): string {
  void localCoverVersion.value;
  if (snapshot.type === 'track') return trackCover(snapshot);
  return localCover(entityKey(snapshot)) || resolveUrl(snapshot.cover_url);
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
