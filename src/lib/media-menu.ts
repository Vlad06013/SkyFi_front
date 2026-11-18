import type { AnySnapshot, SnapshotSource } from '@/types';
import { artistsLine } from '@/lib/cover';

export type MenuVariant = 'track' | 'playlist-track' | 'friend-track' | 'now' | 'collection' | 'video';

export type MediaSheet = 'friend-queue' | 'friend-share' | 'playlist' | 'share' | 'devices' | null;

export type MenuAction =
  | 'queue'
  | 'friend-queue'
  | 'like'
  | 'playlist'
  | 'download'
  | 'share'
  | 'listen'
  | 'edit'
  | 'delete'
  | 'lyrics'
  | 'devices';

export type MenuEntity = {
  title: string;
  artist: string;
  source: SnapshotSource;
  sourceId: string;
  snapshot?: AnySnapshot;
};

const menuHeight: Record<MenuVariant, number> = {
  track: 292,
  'playlist-track': 245,
  'friend-track': 245,
  now: 292,
  collection: 292,
  video: 156,
};

export function entityFromSnapshot(snapshot: AnySnapshot, artist = artistsLine(snapshot.artists)): MenuEntity {
  return {
    title: snapshot.title,
    artist: artist || snapshot.title,
    source: snapshot.source_type,
    sourceId: snapshot.source_id,
    snapshot,
  };
}

export function menuAnchor(event: MouseEvent, variant: MenuVariant) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const height = menuHeight[variant];
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const top =
    spaceBelow < height && rect.top > height
      ? Math.max(12, rect.top - height - 4)
      : Math.min(rect.bottom + 4, window.innerHeight - height - 12);
  return {
    top,
    right: Math.max(12, window.innerWidth - rect.right),
  };
}
