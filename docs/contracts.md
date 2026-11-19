# SkyFi Contracts — TypeScript-типы и мок-фикстуры

Типы 1:1 с контрактом бэка (`api.md`) + фикстуры для MVP на
моках. Правило дрейфа: сначала правится `api.md`, потом этот
файл, потом фронт. На старте фронта содержимое копируется в
`src/types/` — единственный источник правды о форме данных.

## Снапшоты

```ts
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
  /** Постоянная ссылка, только у источников со стабильными URL
   * (upload). У Яндекса null — запросить /audio/get-url. */
  stream_url: string | null;
  sort?: number | null;
}

export interface VideoSnapshot extends SnapshotBase {
  type: 'video';
  duration_ms: number | null;
  cover_url: string | null;
  /** Постоянная страница в источнике («оригинал», шаринг).
   * Не для воспроизведения. */
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
```

## Обёртка ответа и общие enum'ы

```ts
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

/** Контекст воспроизведения (playback_source). */
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

/** Эхо-поля команд (api.md §1.6). */
export interface EchoFields {
  origin_device_id: number | string;
  command_id: string;
}
```

## Пользователь, устройства, плеер

```ts
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  /** Проверено curl'ом: бэк отдаёт avatar_url (не avatar). */
  avatar_url: string | null;
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
  /** Растёт с каждым изменением: устаревшие апдейты отсекаем. */
  version: number;
  play_source: PlaySource;
  previous_play_source: PlaySource;
  previous_play_source_snapshot: AnySnapshot | null;
  wave_anchor: string | null;
  active_device_id: number | null;
  devices: PlayerDevice[];
}

/** data ответа GET /player и всех команд плеера. */
export interface PlayerStatePayload {
  state: PlayerStateView;
  queue: QueueItem[];
}

export interface HealthPayload {
  status: 'ok';
  server_time: string;
}
```

## QR-вход (api.md §3, формы проверены curl'ом)

```ts
/** data ответа POST /qr-login. */
export interface QrStartPayload {
  code: string;
  /** Абсолютный срок жизни кода, ISO 8601 UTC (~15 мин). */
  expires_at: string;
  /** Готовый QR в SVG — фронт рендерит как есть, не генерирует. */
  qr_svg: string;
}

export type QrStatusValue = 'pending' | 'confirmed';

/** data ответа GET /qr-login/{code} (поллинг ТВ). */
export interface QrStatusPayload {
  status: QrStatusValue;
  /** Заполнены только при confirmed. */
  token: string | null;
  /** При confirmed — полная модель; фронту нужны id/name/email/avatar_url. */
  user: (AuthUser & Record<string, unknown>) | null;
}

/** data ответа POST /qr-login/confirm. */
export interface QrConfirmPayload {
  status: 'confirmed';
}
```

## Яндекс Музыка: подключение аккаунта (api.md §3, формы проверены curl'ом)

```ts
/** data ответа POST /yandex-music/auth/device/start. Идемпотентен: активную сессию возвращает как есть. */
export interface YandexDeviceStartPayload {
  session_id: string;
  status: string;
  /** Сервис Яндекса может вернуть null — код/ссылку тогда подхватывает поллинг статуса. */
  verification_url: string | null;
  user_code: string | null;
}

/** data ответа GET /yandex-music/auth/device/status. Бэк может вернуть и другие строки (cancelled и т.п.) — трактуем как «сессия умерла». */
export type YandexDeviceStatusValue = 'not_started' | 'pending' | 'connected' | 'expired' | 'failed' | 'consumed';

/** data ответа GET /yandex-music/auth/device/status — одновременно поллинг сессии и проверка «подключён ли аккаунт». */
export interface YandexDeviceStatusPayload {
  status: YandexDeviceStatusValue;
  /** Сохранён ли токен Яндекса на сервере. */
  connected: boolean;
  /** Заполнены при активной pending-сессии. */
  verification_url?: string | null;
  /** Заполнен при активной pending-сессии. */
  user_code?: string | null;
  message?: string;
}

/** data ответа DELETE /yandex-music/auth. */
export interface YandexDisconnectPayload {
  connected: boolean;
  message: string;
}
```

## Импорт «Мне нравится» из Яндекс Музыки (api.md §16, формы по коду бэка)

```ts
export interface YandexImportSection {
  /** Сколько лайкнуто в Яндексе. */
  total: number;
  /** Сколько уже перенесено в SkyFi (маркер import_source: "yandex"). */
  existing: number;
}

/** data ответа GET /import/yandex-music/summary. Видео Яндекс не лайкает: total всегда 0. */
export interface YandexImportSummaryPayload {
  tracks: YandexImportSection;
  videos: YandexImportSection;
  albums: YandexImportSection;
  playlists: YandexImportSection;
  artists: YandexImportSection;
}

export type YandexImportStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** data ответов POST/GET/DELETE /import/yandex-music; null — задачи ещё не было. */
export interface YandexImportProgressPayload {
  job_id: string;
  status: YandexImportStatus;
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
  /** Процент 0–100. */
  progress: number;
  message: string | null;
  started_at: string | null;
  finished_at: string | null;
}
```

## Потоки

```ts
/** data ответа /audio/get-url. */
export interface StreamUrlPayload {
  url: string;
  ttlSec: number;
}

export interface VideoStream {
  quality: number;
  url: string;
}

/** data ответа /videos/get-url. */
export interface VideoStreamsPayload {
  streams: VideoStream[];
  ttl_sec: number;
}

/** data ответа /videos/resolve. */
export interface VideoResolvePayload {
  video: VideoSnapshot;
  streams: VideoStream[];
  ttl_sec: number;
}
```

## Поиск

```ts
export interface SearchSection<T> {
  items: T[];
  total: number;
  has_more: boolean;
}

/** Пометка избранного — только в поисковой выдаче. */
export type WithFavorite<T> = T & { is_favorite: boolean };

/** data ответа GET /search. Все секции всегда присутствуют. */
export interface SearchPagePayload {
  query: string;
  page: number;
  best: Record<string, unknown> | null;
  tracks: SearchSection<WithFavorite<TrackSnapshot>>;
  albums: SearchSection<WithFavorite<AlbumSnapshot>>;
  artists: SearchSection<WithFavorite<ArtistSnapshot>>;
  playlists: SearchSection<WithFavorite<PlaylistSnapshot>>;
  videos: SearchSection<WithFavorite<VideoSnapshot>>;
}
```

## Избранное, плейлисты, волна

```ts
/** data ответа GET /favorites без фильтра: вкладки по типам. */
export interface FavoritesPayload {
  tracks: TrackSnapshot[];
  albums: AlbumSnapshot[];
  artists: ArtistSnapshot[];
  playlists: PlaylistSnapshot[];
}

export interface PlaylistPayload {
  playlist: {
    snapshot: PlaylistSnapshot;
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

export type WaveFeedbackType =
  | 'like'
  | 'dislike'
  | 'skip'
  | 'trackStarted'
  | 'trackFinished'
  | 'radioStarted';
```

## Сокеты (payload ивентов, api.md §17)

```ts
export interface PlaybackStateUpdatedPayload {
  state: PlayerStateView;
  origin_device_id: number | string | null;
  command_id: string | null;
}

export interface PlaybackQueueUpdatedPayload {
  item: { title: string; artists: string[] } | null;
  origin_device_id: number | string | null;
  command_id: string | null;
}

export interface FriendQueueItemAddedPayload {
  added_by: { id: number; name: string };
  item: { source_id: string; title: string; artists: string[] };
}

export interface PlaybackDeviceConnectedPayload {
  device: PlayerDevice;
  origin_device_id: number | string | null;
}

export interface PlaybackDeviceChangedPayload {
  device_id: number;
  origin_device_id: number | string | null;
}

export interface PlaybackDeviceDisconnectedPayload {
  device_id: number;
  device_name: string;
  origin_device_id: number | string | null;
  command_id: string | null;
}

export interface FriendshipSide {
  id: number;
  name: string;
  avatar: string | null;
  current_snapshot: AnySnapshot | null;
}

export interface FriendshipPayload {
  id: number;
  sender: FriendshipSide;
  receiver: FriendshipSide;
  status: string;
  created_at: string | null;
}

export interface ShareSentPayload {
  share_id: number;
  sender: { id: number; name: string };
  snapshot: AnySnapshot;
}
```

## Мок-фикстуры для MVP

Формы совпадают с бэком (мок-видео — с реальными потоками,
api.md §8/§9). Копировать в `src/mocks/`.

```ts
export const mockTrack: TrackSnapshot = {
  type: 'track',
  source_type: 'yandex_music',
  source_id: '111',
  title: 'Radio Silence',
  duration_ms: 203310,
  artists: [{ name: 'Sum 41', source_id: '5950' }],
  album: { title: 'Heaven :x: Hell', year: '2024', cover_url: 'https://example.com/c.webp' },
  stream_url: null,
};

export const mockVideo: VideoSnapshot = {
  type: 'video',
  source_type: 'mock',
  source_id: 'mock-big-buck-bunny',
  title: 'Big Buck Bunny (mock video)',
  duration_ms: 10000,
  artists: [{ name: 'Blender Foundation' }],
  cover_url: 'https://archive.org/download/BigBuckBunny_124/__ia_thumb.jpg',
  watch_url: 'https://test-videos.co.uk/',
};

export const mockVideoStreams: VideoStreamsPayload = {
  streams: [
    { quality: 360, url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4' },
    { quality: 720, url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4' },
    { quality: 1080, url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_1MB.mp4' },
  ],
  ttl_sec: 21600,
};

export const mockSearchPage: SearchPagePayload = {
  query: 'sum 41',
  page: 1,
  best: null,
  tracks: { items: [{ ...mockTrack, is_favorite: true }], total: 748, has_more: true },
  albums: { items: [], total: 0, has_more: false },
  artists: { items: [], total: 0, has_more: false },
  playlists: { items: [], total: 0, has_more: false },
  videos: { items: [{ ...mockVideo, is_favorite: false }], total: 2, has_more: false },
};

export const mockPlayerState: PlayerStatePayload = {
  state: {
    id: 1,
    current_snapshot: mockTrack,
    position_seconds: 42,
    is_playing: true,
    repeat_mode: 'all',
    shuffle_enabled: false,
    version: 7,
    play_source: 'favorites',
    previous_play_source: 'single',
    previous_play_source_snapshot: null,
    wave_anchor: null,
    active_device_id: 1,
    devices: [
      { id: 1, name: 'Pixel 7', type: 'phone', is_active: true, last_seen_at: new Date().toISOString() },
    ],
  },
  queue: [
    {
      id: 10,
      player_state_id: 1,
      added_by_user_id: 2,
      position: 1,
      status: 'pending',
      snapshot: mockTrack,
    },
  ],
};
```
