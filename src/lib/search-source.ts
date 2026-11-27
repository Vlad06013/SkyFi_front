import type { SearchWireSection } from '@/api/search';
import type {
  AlbumSnapshot,
  AnySnapshot,
  ArtistSnapshot,
  PlaylistSnapshot,
  SearchSection,
  SearchSourcePagePayload,
  SnapshotSource,
  TrackSnapshot,
  VideoSnapshot,
  WithFavorite,
} from '@/types';

export type SearchPill = 'best' | SearchWireSection;

export interface SearchResourceOption {
  id: SnapshotSource;
  label: string;
}

export interface SearchPillOption {
  id: SearchPill;
  label: string;
}

/** Порядок ряда: аудио, потом видео. Подписи — как в макете. */
export const SEARCH_RESOURCES: SearchResourceOption[] = [
  { id: 'yandex_music', label: 'Яндекс' },
  { id: 'upload', label: 'Загрузки' },
  { id: 'skyfi', label: 'SkyFi' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'dzen', label: 'Дзен' },
];

const YANDEX_PILLS: SearchPillOption[] = [
  { id: 'best', label: 'Лучшее' },
  { id: 'tracks', label: 'Треки' },
  { id: 'albums', label: 'Альбомы' },
  { id: 'artists', label: 'Артисты' },
  { id: 'playlists', label: 'Плейлисты' },
];

export function searchMediaType(resource: SnapshotSource): 'audio' | 'video' {
  return resource === 'youtube' || resource === 'dzen' ? 'video' : 'audio';
}

export function pillsFor(resource: SnapshotSource): SearchPillOption[] {
  if (resource === 'yandex_music') return YANDEX_PILLS;
  if (resource === 'upload') return [{ id: 'tracks', label: 'Треки' }];
  if (resource === 'skyfi') return [{ id: 'playlists', label: 'Плейлисты' }];
  return [{ id: 'videos', label: 'Видео' }];
}

export function defaultPill(resource: SnapshotSource): SearchPill {
  return pillsFor(resource)[0].id;
}

/** «Лучшее» не секция: без фильтра приходит best. */
export function wireSection(pill: SearchPill): SearchWireSection | undefined {
  return pill === 'best' ? undefined : pill;
}

export interface SearchView {
  query: string;
  page: number;
  best: WithFavorite<AnySnapshot> | null;
  tracks: SearchSection<WithFavorite<TrackSnapshot>>;
  albums: SearchSection<WithFavorite<AlbumSnapshot>>;
  artists: SearchSection<WithFavorite<ArtistSnapshot>>;
  playlists: SearchSection<WithFavorite<PlaylistSnapshot>>;
  videos: SearchSection<WithFavorite<VideoSnapshot>>;
}

function emptySection<T>(): SearchSection<WithFavorite<T>> {
  return { items: [], total: 0, has_more: false };
}

function sectionOf<T>(payload: SearchSourcePagePayload, key: SearchWireSection): SearchSection<WithFavorite<T>> {
  return (payload.sections[key] as SearchSection<WithFavorite<T>> | undefined) ?? emptySection();
}

export function viewFromSource(payload: SearchSourcePagePayload): SearchView {
  return {
    query: payload.query,
    page: payload.page,
    best: payload.best,
    tracks: sectionOf(payload, 'tracks'),
    albums: sectionOf(payload, 'albums'),
    artists: sectionOf(payload, 'artists'),
    playlists: sectionOf(payload, 'playlists'),
    videos: sectionOf(payload, 'videos'),
  };
}

function itemKey(item: AnySnapshot): string {
  return `${item.type}:${item.source_type}:${item.source_id}`;
}

/** Склейка страницы: уже виденная тройка (type, source_type, source_id) не повторяется. */
function mergeSection<T extends AnySnapshot>(
  prev: SearchSection<WithFavorite<T>>,
  next: SearchSection<WithFavorite<T>>,
): SearchSection<WithFavorite<T>> {
  const seen = new Set(prev.items.map(itemKey));
  const items = [...prev.items];
  for (const item of next.items) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return { ...next, items };
}

export function mergeSearchView(prev: SearchView, next: SearchView): SearchView {
  return {
    ...next,
    best: next.best ?? prev.best,
    tracks: mergeSection(prev.tracks, next.tracks),
    albums: mergeSection(prev.albums, next.albums),
    artists: mergeSection(prev.artists, next.artists),
    playlists: mergeSection(prev.playlists, next.playlists),
    videos: mergeSection(prev.videos, next.videos),
  };
}

/**
 * context_ref поиска v2. Старый ref — голый запрос, без префикса.
 * Секция «-» — запрос без фильтра (Лучшее). Хвост после второго слэша — сам запрос, в нём бывают «:» и «/».
 */
const V2_PREFIX = 'v2/';

export function searchContextRef(resource: SnapshotSource, pill: SearchPill, query: string): string {
  const section = pill === 'best' ? '-' : pill;
  return `${V2_PREFIX}${resource}/${section}/${query}`;
}

const RESOURCES = new Set<string>(SEARCH_RESOURCES.map((item) => item.id));
const SECTIONS = new Set<string>(['tracks', 'albums', 'artists', 'playlists', 'videos']);

export function parseSearchContextRef(
  ref: string,
): { resource: SnapshotSource; section: SearchWireSection | null; query: string } | null {
  if (!ref.startsWith(V2_PREFIX)) return null;
  const body = ref.slice(V2_PREFIX.length);
  const resourceEnd = body.indexOf('/');
  if (resourceEnd <= 0) return null;
  const resource = body.slice(0, resourceEnd);
  const rest = body.slice(resourceEnd + 1);
  const sectionEnd = rest.indexOf('/');
  if (sectionEnd <= 0) return null;
  const sectionToken = rest.slice(0, sectionEnd);
  const query = rest.slice(sectionEnd + 1);
  if (!RESOURCES.has(resource) || !query) return null;
  if (sectionToken === '-') return { resource: resource as SnapshotSource, section: null, query };
  if (!SECTIONS.has(sectionToken)) return null;
  return { resource: resource as SnapshotSource, section: sectionToken as SearchWireSection, query };
}
