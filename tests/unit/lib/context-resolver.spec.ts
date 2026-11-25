import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as detailsApi from '@/api/details';
import * as favoritesApi from '@/api/favorites';
import * as searchApi from '@/api/search';
import * as uploadsApi from '@/api/uploads';
import * as waveApi from '@/api/wave';
import {
  CONTEXT_PAGE_LIMIT,
  fetchContextPage,
  parsePlaylistContextRef,
  playlistContextRef,
  resolveContext,
  type ContextRequest,
} from '@/lib/context-resolver';
import type { AnySnapshot, SearchPagePayload } from '@/types';

vi.mock('@/api/details', () => ({ fetchEntityDetails: vi.fn() }));
vi.mock('@/api/favorites', () => ({ fetchFavorites: vi.fn() }));
vi.mock('@/api/search', () => ({ fetchSearch: vi.fn() }));
vi.mock('@/api/uploads', () => ({ fetchUploads: vi.fn() }));
vi.mock('@/api/wave', () => ({ fetchWaveWindow: vi.fn() }));

const fetchEntityDetailsMock = vi.mocked(detailsApi.fetchEntityDetails);
const fetchFavoritesMock = vi.mocked(favoritesApi.fetchFavorites);
const fetchSearchMock = vi.mocked(searchApi.fetchSearch);
const fetchUploadsMock = vi.mocked(uploadsApi.fetchUploads);
const fetchWaveWindowMock = vi.mocked(waveApi.fetchWaveWindow);

function track(sourceId: string): AnySnapshot {
  return {
    type: 'track',
    source_type: 'yandex_music',
    source_id: sourceId,
    title: `track ${sourceId}`,
    artists: [{ name: 'Artist' }],
    duration_ms: 180_000,
    cover_url: null,
    album: null,
    stream_url: null,
  };
}

function searchPage(query: string, page: number, tracks: AnySnapshot[]): SearchPagePayload {
  const empty = { items: [], total: 0, has_more: false };
  return {
    query,
    page,
    best: null,
    tracks: { items: tracks, total: tracks.length, has_more: false },
    albums: empty,
    artists: empty,
    playlists: empty,
    videos: { items: [], total: 0, has_more: false },
  };
}

describe('context-resolver: playlist context_ref', () => {
  it('roundtrip: source_type:source_id парсится обратно', () => {
    const ref = playlistContextRef('yandex_music', '139954184:1863');
    expect(ref).toBe('yandex_music:139954184:1863');
    expect(parsePlaylistContextRef(ref)).toEqual({ sourceType: 'yandex_music', sourceId: '139954184:1863' });
  });

  it('битые ref не парсятся', () => {
    expect(parsePlaylistContextRef(null)).toBeNull();
    expect(parsePlaylistContextRef('')).toBeNull();
    expect(parsePlaylistContextRef('no-separator')).toBeNull();
    expect(parsePlaylistContextRef(':empty-type')).toBeNull();
    expect(parsePlaylistContextRef('trailing:')).toBeNull();
  });
});

describe('context-resolver: fetchContextPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('single/queue по ref не резолвятся', async () => {
    const req: ContextRequest = { playSource: 'single', contextRef: 'x', currentType: 'track' };
    expect(await fetchContextPage(req, 1)).toBeNull();
    expect(await fetchContextPage({ ...req, playSource: 'queue' }, 1)).toBeNull();
    expect(fetchSearchMock).not.toHaveBeenCalled();
  });

  it('favorites/uploads/wave: одна страница целиком, второй страницы нет', async () => {
    const tracks = [track('f1')];
    fetchFavoritesMock.mockResolvedValue({ tracks, videos: [], albums: [], artists: [], playlists: [] } as never);
    fetchUploadsMock.mockResolvedValue(tracks as never);
    fetchWaveWindowMock.mockResolvedValue(tracks as never);

    const favorites = await fetchContextPage({ playSource: 'favorites', contextRef: null, currentType: 'track' }, 1);
    expect(favorites).toEqual({ items: tracks, hasMore: false });
    expect(await fetchContextPage({ playSource: 'favorites', contextRef: null, currentType: 'track' }, 2)).toEqual({
      items: [],
      hasMore: false,
    });
    expect((await fetchContextPage({ playSource: 'uploads', contextRef: null, currentType: 'track' }, 1))?.items).toBe(
      tracks,
    );
    expect((await fetchContextPage({ playSource: 'wave', contextRef: null, currentType: 'track' }, 1))?.items).toEqual(
      tracks,
    );
  });

  it('search: грузит секцию треков, секция выбирается по типу current', async () => {
    const tracks = [track('s1')];
    fetchSearchMock.mockResolvedValue(searchPage('рок', 1, tracks) as never);

    const req: ContextRequest = { playSource: 'search', contextRef: 'рок', currentType: 'track' };
    const page = await fetchContextPage(req, 1);

    expect(fetchSearchMock).toHaveBeenCalledWith({ q: 'рок', limit: CONTEXT_PAGE_LIMIT, page: 1 });
    expect(page?.items).toBe(tracks);
    // пустая выдача — продолжения нет; непустая — есть (как в Search.ts)
    expect(page?.hasMore).toBe(true);
  });

  it('search: current — видео, грузится секция videos', async () => {
    const video: AnySnapshot = {
      type: 'video',
      source_type: 'zen',
      source_id: 'v1',
      title: 'clip',
      artists: [],
      duration_ms: 60_000,
      cover_url: null,
      watch_url: null,
    };
    const empty = { items: [], total: 0, has_more: false };
    fetchSearchMock.mockResolvedValue({
      query: 'рок',
      page: 1,
      best: null,
      tracks: { items: [track('s1')], total: 1, has_more: false },
      albums: empty,
      artists: empty,
      playlists: empty,
      videos: { items: [video], total: 1, has_more: false },
    } as never);

    const page = await fetchContextPage({ playSource: 'search', contextRef: 'рок', currentType: 'video' }, 1);

    expect(page?.items).toHaveLength(1);
    expect(page?.items[0].type).toBe('video');
  });

  it('search: пустой ref — пустой контекст без запроса', async () => {
    const page = await fetchContextPage({ playSource: 'search', contextRef: null, currentType: 'track' }, 1);
    expect(page).toEqual({ items: [], hasMore: false });
    expect(fetchSearchMock).not.toHaveBeenCalled();
  });

  it('playlist: ref парсится в /details с парой источника', async () => {
    const tracks = [track('p1')];
    fetchEntityDetailsMock.mockResolvedValue({
      entity: null,
      tracks: { items: tracks, total: 1, has_more: false },
      albums: { items: [], total: 0, has_more: false },
    } as never);

    const page = await fetchContextPage(
      { playSource: 'playlist', contextRef: 'skyfi:pl-1', currentType: 'track' },
      1,
    );

    expect(fetchEntityDetailsMock).toHaveBeenCalledWith(
      { type: 'playlist', source_type: 'skyfi', source_id: 'pl-1' },
      { page: 1, limit: CONTEXT_PAGE_LIMIT },
    );
    expect(page?.items).toBe(tracks);
    expect(page?.hasMore).toBe(false);
  });

  it('playlist: битый ref — null без запроса', async () => {
    expect(await fetchContextPage({ playSource: 'playlist', contextRef: 'no-separator', currentType: 'track' }, 1)).toBeNull();
    expect(fetchEntityDetailsMock).not.toHaveBeenCalled();
  });
});

describe('context-resolver: resolveContext', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('грузит страницы, пока current не найден, и оставляет хвост за краем', async () => {
    const page1 = [track('s1'), track('s2')];
    const page2 = [track('s3'), track('s4')];
    const page3 = [track('s5')];
    fetchSearchMock
      .mockResolvedValueOnce(searchPage('рок', 1, page1) as never)
      .mockResolvedValueOnce(searchPage('рок', 2, page2) as never)
      .mockResolvedValueOnce(searchPage('рок', 3, page3) as never);

    const resolved = await resolveContext(
      { playSource: 'search', contextRef: 'рок', currentType: 'track' },
      track('s3'),
    );

    expect(fetchSearchMock).toHaveBeenCalledTimes(2);
    expect(resolved.items.map((item) => item.source_id)).toEqual(['s1', 's2', 's3', 's4']);
    expect(resolved.pages).toBe(2);
    expect(resolved.hasMore).toBe(true);
  });

  it('current отсутствует (протух) — грузит весь лист до конца', async () => {
    fetchSearchMock
      .mockResolvedValueOnce(searchPage('рок', 1, [track('s1')]) as never)
      .mockResolvedValueOnce(searchPage('рок', 2, []) as never);

    const resolved = await resolveContext(
      { playSource: 'search', contextRef: 'рок', currentType: 'track' },
      track('missing'),
    );

    expect(fetchSearchMock).toHaveBeenCalledTimes(2);
    expect(resolved.items.map((item) => item.source_id)).toEqual(['s1']);
    expect(resolved.hasMore).toBe(false);
  });

  it('current — уже на первой странице: вторая не тянется', async () => {
    fetchSearchMock.mockResolvedValueOnce(searchPage('рок', 1, [track('s1'), track('s2')]) as never);

    const resolved = await resolveContext({ playSource: 'search', contextRef: 'рок', currentType: 'track' }, track('s1'));

    expect(fetchSearchMock).toHaveBeenCalledTimes(1);
    expect(resolved.hasMore).toBe(true);
    expect(resolved.pages).toBe(1);
  });
});
