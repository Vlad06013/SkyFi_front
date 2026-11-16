import type { SnapshotSource } from '@/types';

export function coverVar(source: SnapshotSource): string {
  if (source === 'yandex_music' || source === 'mock') return 'var(--gradient-cover-1)';
  if (source === 'vk') return 'var(--gradient-cover-3)';
  return 'var(--gradient-cover-2)';
}

export function sourceTitle(source: SnapshotSource): string {
  if (source === 'yandex_music') return 'Яндекс';
  if (source === 'vk') return 'VK';
  if (source === 'upload') return 'Файл';
  return 'SkyFi';
}

export function artistsLine(artists: { name: string }[]): string {
  return artists.map((a) => a.name).join(', ');
}
