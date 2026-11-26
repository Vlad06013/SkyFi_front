import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { ApiError } from '@/api/http';
import * as favoritesApi from '@/api/favorites';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import { useFavoritesStore } from '@/stores/favorites';
import type { TrackSnapshot } from '@/types';

vi.mock('@/api/favorites', () => ({
  fetchFavorites: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  sortFavorites: vi.fn(),
}));

const fetchMock = vi.mocked(favoritesApi.fetchFavorites);
const addMock = vi.mocked(favoritesApi.addFavorite);
const removeMock = vi.mocked(favoritesApi.removeFavorite);
const sortMock = vi.mocked(favoritesApi.sortFavorites);

function makeTrack(id: string): TrackSnapshot {
  return {
    type: 'track',
    source_type: 'yandex_music',
    source_id: id,
    title: `Трек ${id}`,
    artists: [],
    duration_ms: null,
    cover_url: null,
    album: null,
    stream_url: null,
  };
}

const PAYLOAD = {
  tracks: [makeTrack('t1'), makeTrack('t2')],
  videos: [],
  albums: [],
  artists: [],
  playlists: [],
};

function loginAsUser() {
  const auth = useAuthStore();
  auth.user = { id: 1, name: 'Влад', email: 'v@mail.ru', avatar_url: null };
  auth.token = 't1';
}

describe('stores/favorites', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock.mockReset();
    addMock.mockReset();
    removeMock.mockReset();
    sortMock.mockReset();
    fetchMock.mockResolvedValue(PAYLOAD);
    addMock.mockResolvedValue({ message: 'ок', is_favorite: true });
    removeMock.mockResolvedValue({ message: 'ок' });
    sortMock.mockResolvedValue({ updated: 2 });
  });

  it('автозагрузка: авторизован + онлайн → вкладки с сервера', async () => {
    loginAsUser();
    useOnlineStore().isOnline = true;

    const favorites = useFavoritesStore();
    expect(favorites.loaded).toBe(false);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(favorites.loaded).toBe(true);
    expect(favorites.tracks.map((t) => t.source_id)).toEqual(['t1', 't2']);
  });

  it('гость не грузит; повторные триггеры без выхода не дёргают сеть повторно', async () => {
    useOnlineStore().isOnline = true;
    useFavoritesStore();
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalled();

    loginAsUser();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Онлайн моргнул — загруженное не перезапрашиваем.
    useOnlineStore().isOnline = false;
    await flushPromises();
    useOnlineStore().isOnline = true;
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('выход чистит списки; повторный вход перезагружает', async () => {
    loginAsUser();
    useOnlineStore().isOnline = true;
    const favorites = useFavoritesStore();
    await flushPromises();
    expect(favorites.tracks.length).toBe(2);

    const auth = useAuthStore();
    auth.user = null;
    auth.token = null;
    await flushPromises();
    expect(favorites.tracks.length).toBe(0);
    expect(favorites.loaded).toBe(false);

    loginAsUser();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('add: оптимистично добавляет и постит; при ошибке откатывает', async () => {
    loginAsUser();
    useOnlineStore().isOnline = true;
    const favorites = useFavoritesStore();
    await flushPromises();

    const track = makeTrack('t9');
    await favorites.add(track);
    expect(favorites.has(track)).toBe(true);
    expect(addMock).toHaveBeenCalledWith(track);

    addMock.mockRejectedValueOnce(new ApiError(null, 'network', 'Нет соединения.'));
    const other = makeTrack('t10');
    await favorites.add(other).catch(() => undefined);
    expect(favorites.has(other)).toBe(false);
  });

  it('remove: оптимистично убирает и шлёт DELETE; при ошибке возвращает на место', async () => {
    loginAsUser();
    useOnlineStore().isOnline = true;
    const favorites = useFavoritesStore();
    await flushPromises();

    const first = favorites.tracks[0];
    await favorites.remove(first);
    expect(favorites.has(first)).toBe(false);
    expect(removeMock).toHaveBeenCalledWith(first);

    removeMock.mockRejectedValueOnce(new ApiError(null, 'network', 'Нет соединения.'));
    const second = favorites.tracks[0];
    await favorites.remove(second).catch(() => undefined);
    expect(favorites.tracks[0]).toEqual(second);
  });

  it('toggle: лайк и снятие лайка', async () => {
    loginAsUser();
    useOnlineStore().isOnline = true;
    const favorites = useFavoritesStore();
    await flushPromises();

    const track = makeTrack('t9');
    await expect(favorites.toggle(track)).resolves.toBe(true);
    expect(favorites.has(track)).toBe(true);
    await expect(favorites.toggle(track)).resolves.toBe(false);
    expect(favorites.has(track)).toBe(false);
  });

  it('reorder: локальный порядок + PATCH sort весами (больший вес = выше)', async () => {
    loginAsUser();
    useOnlineStore().isOnline = true;
    const favorites = useFavoritesStore();
    await flushPromises();

    favorites.reorder(0, 1);
    expect(favorites.tracks.map((t) => t.source_id)).toEqual(['t2', 't1']);
    await flushPromises();
    expect(sortMock).toHaveBeenCalledWith('track', [
      { source_type: 'yandex_music', source_id: 't2', sort: 1 },
      { source_type: 'yandex_music', source_id: 't1', sort: 0 },
    ]);
  });
});
