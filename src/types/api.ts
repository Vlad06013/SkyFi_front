import type { AnySnapshot, TrackSnapshot } from './snapshots';

export interface ApiResponse<T> {
  errors: string | Record<string, string[]> | null;
  data: T;
  pagination: Pagination | null;
}

export interface Pagination {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export type RepeatMode = 'off' | 'one' | 'all';
export type Shuffle = boolean;
export type PlaySource =
  | 'single'
  | 'queue'
  | 'favorites'
  | 'search'
  | 'playlist'
  | 'uploads'
  | 'yandex_wave';
export type QueueItemStatus = 'pending' | 'playing_now' | 'played' | 'skipped';
export type DeviceType = 'phone' | 'computer' | 'car' | 'tv';
export type Visibility = 'public' | 'friends' | 'private';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
}

export interface AuthPayload {
  user: AuthUser;
  token: string;
}

export interface PlayerDevice {
  id: number;
  name: string;
  type: DeviceType;
  is_active: boolean;
  last_seen_at: string | null;
}

export interface QueueItem {
  id: number;
  player_state_id: number;
  added_by_user_id: number | null;
  position: number;
  status: QueueItemStatus;
  snapshot: AnySnapshot | null;
}

export interface PlayerStateView {
  id: number;
  current_snapshot: AnySnapshot | null;
  position_seconds: number;
  is_playing: boolean;
  repeat_mode: RepeatMode;
  shuffle_enabled: Shuffle;
  version: number;
  play_source: PlaySource;
  previous_play_source: PlaySource;
  previous_play_source_snapshot: AnySnapshot | null;
  wave_anchor: string | null;
  active_device_id: number | null;
  devices: PlayerDevice[];
}

export interface PlayerStatePayload {
  state: PlayerStateView;
  queue: QueueItem[];
}

export interface SearchSection<T> {
  items: T[];
  total: number;
  has_more: boolean;
}

export type WithFavorite<T> = T & { is_favorite: boolean };

export interface SearchPagePayload {
  query: string;
  page: number;
  best: Record<string, unknown> | null;
  tracks: SearchSection<WithFavorite<TrackSnapshot>>;
  albums: SearchSection<WithFavorite<import('./snapshots').AlbumSnapshot>>;
  artists: SearchSection<WithFavorite<import('./snapshots').ArtistSnapshot>>;
  playlists: SearchSection<WithFavorite<import('./snapshots').PlaylistSnapshot>>;
  videos: SearchSection<WithFavorite<import('./snapshots').VideoSnapshot>>;
}

export interface FavoritesPayload {
  tracks: TrackSnapshot[];
  albums: import('./snapshots').AlbumSnapshot[];
  artists: import('./snapshots').ArtistSnapshot[];
  playlists: import('./snapshots').PlaylistSnapshot[];
}

export interface PlaylistPayload {
  playlist: {
    snapshot: import('./snapshots').PlaylistSnapshot;
    name: string;
    cover_url: string | null;
    visibility: Visibility;
    item_count: number;
    created_at: string | null;
    updated_at: string | null;
  };
  snapshots: AnySnapshot[];
}

export interface WavePayload {
  batch_id: string;
  tracks: TrackSnapshot[];
}
