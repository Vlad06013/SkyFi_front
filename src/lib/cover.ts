import type { SnapshotSource, TrackSnapshot } from '@/types';

export function coverVar(source: SnapshotSource): string {
  if (source === 'yandex_music' || source === 'mock') return 'var(--gradient-cover-1)';
  if (source === 'vk') return 'var(--gradient-cover-3)';
  return 'var(--gradient-cover-2)';
}

/** Обложка трека: своё поле, фолбэк — обложка альбома. */
export function trackCover(track: TrackSnapshot): string {
  return track.cover_url ?? track.album?.cover_url ?? '';
}

export function sourceTitle(source: SnapshotSource): string {
  if (source === 'yandex_music') return 'Яндекс';
  if (source === 'vk') return 'VK';
  if (source === 'upload') return 'Файл';
  return 'SkyFi';
}

export function artistsLine(artists: { name: string }[] | null | undefined): string {
  // Бэк не шлёт artists у artist-снапшотов (проверено curl'ом, api.md §9).
  return (artists ?? []).map((a) => a.name).join(', ');
}
