export type SnapshotType = 'track' | 'video' | 'album' | 'playlist' | 'artist';
export type SnapshotSource = 'yandex_music' | 'upload' | 'vk' | 'skyfi' | 'mock';

export interface ArtistRef {
  name: string;
  source_id?: string;
}

interface SnapshotBase {
  type: SnapshotType;
  source_type: SnapshotSource;
  source_id: string;
  title: string;
  artists: ArtistRef[];
}

export interface TrackSnapshot extends SnapshotBase {
  type: 'track';
  duration_ms: number | null;
  album: {
    title?: string;
    year?: string;
    cover_url?: string;
    source_id?: string;
  } | null;
  stream_url: string | null;
  sort?: number | null;
}

export interface VideoSnapshot extends SnapshotBase {
  type: 'video';
  duration_ms: number | null;
  cover_url: string | null;
  watch_url: string | null;
  sort?: number | null;
}

export interface AlbumSnapshot extends SnapshotBase {
  type: 'album';
  year: string | null;
  cover_url: string | null;
  track_count: number | null;
}

export interface ArtistSnapshot extends SnapshotBase {
  type: 'artist';
  cover_url: string | null;
}

export interface PlaylistSnapshot extends SnapshotBase {
  type: 'playlist';
  owner_name: string | null;
  cover_url: string | null;
  item_count: number | null;
}

export type AnySnapshot =
  | TrackSnapshot
  | VideoSnapshot
  | AlbumSnapshot
  | ArtistSnapshot
  | PlaylistSnapshot;
