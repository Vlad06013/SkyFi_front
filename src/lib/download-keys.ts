import type { AlbumSnapshot, AnySnapshot, PlaylistSnapshot, TrackSnapshot } from '@/types';

export type CollectionSnapshot = AlbumSnapshot | PlaylistSnapshot;

export function entityKey(snapshot: Pick<AnySnapshot, 'type' | 'source_type' | 'source_id'>): string {
  return `${snapshot.type}:${snapshot.source_type}:${snapshot.source_id}`;
}

export function trackFilePath(snapshot: Pick<TrackSnapshot, 'type' | 'source_type' | 'source_id'>): string {
  return `tracks/${encodeURIComponent(entityKey(snapshot))}.mp3`;
}

export function coverFilePath(snapshot: Pick<AnySnapshot, 'type' | 'source_type' | 'source_id'>): string {
  return `covers/${encodeURIComponent(entityKey(snapshot))}`;
}

export function linkId(trackKey: string, ownerKey: string): string {
  return `${trackKey}\n${ownerKey}`;
}

export function isCollection(snapshot: AnySnapshot): snapshot is CollectionSnapshot {
  return snapshot.type === 'album' || snapshot.type === 'playlist';
}
