import type {
  AlbumSnapshot,
  AnySnapshot,
  ArtistSnapshot,
  PlaylistSnapshot,
  TrackSnapshot,
  VideoSnapshot,
} from './snapshots';

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
  /** Проверено curl'ом: бэк отдаёт avatar_url (не avatar). */
  avatar_url: string | null;
}

export interface AuthPayload {
  user: AuthUser;
  token: string;
}

/** data ответа GET /health (api.md §1.4). */
export interface HealthPayload {
  status: 'ok';
  server_time: string;
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
  /** «Лучшее совпадение»: снапшот любого типа + пометка избранного (api.md §9). У artist поле artists не приходит. */
  best: (AnySnapshot & { is_favorite: boolean }) | null;
  tracks: SearchSection<WithFavorite<TrackSnapshot>>;
  albums: SearchSection<WithFavorite<AlbumSnapshot>>;
  artists: SearchSection<WithFavorite<ArtistSnapshot>>;
  playlists: SearchSection<WithFavorite<PlaylistSnapshot>>;
  videos: SearchSection<WithFavorite<VideoSnapshot>>;
}

/** data ответа POST /details (api.md §11): entity + секции; пагинация — по трекам. */
export interface EntityDetailsPayload {
  entity: AlbumSnapshot | ArtistSnapshot | PlaylistSnapshot;
  tracks: SearchSection<TrackSnapshot>;
  albums: SearchSection<AlbumSnapshot>;
}

/** data ответа GET /favorites без фильтра: вкладки по типам. Ключ videos всегда на месте (у Яндекса пусто). */
export interface FavoritesPayload {
  tracks: TrackSnapshot[];
  videos: import('./snapshots').VideoSnapshot[];
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

/* Загрузки (api.md §15) */

/** data ответа GET /uploads — список своих загрузок. */
export type UploadsPayload = TrackSnapshot[];

/** data ответа POST /uploads — созданная загрузка (форма — TrackSnapshot). */
export type UploadPayload = TrackSnapshot;

/** Патч метаданных PATCH /uploads/{id}: все поля опциональны. */
export interface UploadPatch {
  title?: string;
  artist_names?: string[];
  album_title?: string;
  lyrics?: string | null;
  visibility?: Visibility;
}

/* QR-вход (api.md §3, формы проверены curl'ом). */

export interface QrStartPayload {
  code: string;
  /** Абсолютный срок жизни кода, ISO 8601 UTC (~15 мин). */
  expires_at: string;
  /** Готовый QR в SVG — рендерим как есть, не генерируем. */
  qr_svg: string;
}

export type QrStatusValue = 'pending' | 'confirmed';

/** data ответа GET /qr-login/{code} (поллинг ТВ). */
export interface QrStatusPayload {
  status: QrStatusValue;
  /** Заполнены только при confirmed. */
  token: string | null;
  /** Полная модель; нужны id/name/email/avatar_url. */
  user: (AuthUser & Record<string, unknown>) | null;
}

/** data ответа POST /qr-login/confirm. */
export interface QrConfirmPayload {
  status: 'confirmed';
}

/* Яндекс Музыка: подключение аккаунта (api.md §3, формы проверены curl'ом). */

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

/* Импорт «Мне нравится» из Яндекс Музыки (api.md §16, формы по коду бэка). */

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

/* Друзья (api.md §12, формы — contracts.md). */

/** Сторона дружбы: sender/receiver. `avatar` здесь, а не `avatar_url`
 * (в профиле GET /user — avatar_url): бэк имена не унифицировал,
 * смотрим поле по эндпоинту. */
export interface FriendshipSide {
  id: number;
  name: string;
  avatar: string | null;
  /** Текущий снапшот плеера этой стороны — отдаётся всегда (null, если состояния плеера нет). */
  current_snapshot: AnySnapshot | null;
}

export interface FriendshipPayload {
  id: number;
  sender: FriendshipSide;
  receiver: FriendshipSide;
  status: string;
  created_at: string | null;
}

/** data ответа GET /friends: обзор секциями. Без фильтра наполнены все три;
 * ?section=friends|incoming|outgoing оставляет одну (остальные пустые).
 * ?q= фильтрует по имени собеседника. */
export interface FriendshipOverviewPayload {
  friends: FriendshipPayload[];
  incoming: FriendshipPayload[];
  outgoing: FriendshipPayload[];
}

/** Ивент friend.queue.item.added: друг добавил в мою очередь (api.md §17). */
export interface FriendQueueItemAddedPayload {
  added_by: { id: number; name: string };
  item: { source_id: string; title: string; artists: string[] };
}
