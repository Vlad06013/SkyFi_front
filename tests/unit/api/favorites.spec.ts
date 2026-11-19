import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import { addFavorite, fetchFavorites, removeFavorite, sortFavorites } from '@/api/favorites';
import type { TrackSnapshot } from '@/types';

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

const getMock = vi.mocked(http.get);
const postMock = vi.mocked(http.post);
const deleteMock = vi.mocked(http.delete);
const patchMock = vi.mocked(http.patch);

const track: TrackSnapshot = {
  type: 'track',
  source_type: 'yandex_music',
  source_id: 't1',
  title: 'Трек',
  artists: [],
  duration_ms: null,
  cover_url: null,
  album: null,
  stream_url: null,
};

describe('api/favorites', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    patchMock.mockReset();
  });

  it('fetchFavorites: GET favorites без параметров', async () => {
    const payload = { tracks: [], videos: [], albums: [], artists: [], playlists: [] };
    getMock.mockResolvedValue(payload);
    await expect(fetchFavorites()).resolves.toEqual(payload);
    expect(getMock).toHaveBeenCalledWith('favorites');
  });

  it('addFavorite: POST favorites, тело — снапшот', async () => {
    postMock.mockResolvedValue({ message: 'Добавлено в избранное', is_favorite: true });
    await addFavorite(track);
    expect(postMock).toHaveBeenCalledWith('favorites', track);
  });

  it('removeFavorite: DELETE favorites, снапшот в теле', async () => {
    deleteMock.mockResolvedValue({ message: 'Удалено из избранного' });
    await removeFavorite(track);
    expect(deleteMock).toHaveBeenCalledWith('favorites', { data: track });
  });

  it('sortFavorites: PATCH favorites/sort с индексами', async () => {
    const items = [
      { source_type: 'yandex_music', source_id: 't1', sort: 0 },
      { source_type: 'yandex_music', source_id: 't2', sort: 1 },
    ];
    patchMock.mockResolvedValue({ updated: 2 });
    await sortFavorites('track', items);
    expect(patchMock).toHaveBeenCalledWith('favorites/sort', { type: 'track', items });
  });
});
