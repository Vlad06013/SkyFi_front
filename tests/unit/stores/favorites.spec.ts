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
  moveFavorite: vi.fn(),
}));

const fetchMock = vi.mocked(favoritesApi.fetchFavorites);
const addMock = vi.mocked(favoritesApi.addFavorite);
const removeMock = vi.mocked(favoritesApi.removeFavorite);
const moveMock = vi.mocked(favoritesApi.moveFavorite);

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
    moveMock.mockReset();
    fetchMock.mockResolvedValue(PAYLOAD);
    addMock.mockResolvedValue({ message: 'ок', is_favorite: true });
    removeMock.mockResolvedValue({ message: 'ок' });
    moveMock.mockResolvedValue({ updated: 1 });
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

  it('reorder: локальный порядок + PATCH sort — перенос одного элемента', async () => {
    loginAsUser();
    useOnlineStore().isOnline = true;
    const favorites = useFavoritesStore();
    await flushPromises();

    favorites.reorder(0, 1);
    expect(favorites.tracks.map((t) => t.source_id)).toEqual(['t2', 't1']);
    await flushPromises();
    expect(moveMock).toHaveBeenCalledWith('track', { source_type: 'yandex_music', source_id: 't1' }, 1);
  });

  it('офлайн-снятие лайка: локально убрано, в буфере с позицией, сети не было', async () => {
    loginAsUser();
    useOnlineStore().isOnline = true;
    const favorites = useFavoritesStore();
    await flushPromises();

    useOnlineStore().isOnline = false;
    const first = favorites.tracks[0];
    await expect(favorites.toggle(first)).resolves.toBe(false);

    expect(favorites.has(first)).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
    expect(favorites.removalBuffer).toHaveLength(1);
    expect(favorites.removalBuffer[0]).toMatchObject({ index: 0 });
  });

  it('офлайн: повторное сердечко отменяет удаление и возвращает трек на позицию', async () => {
    loginAsUser();
    useOnlineStore().isOnline = true;
    const favorites = useFavoritesStore();
    await flushPromises();

    useOnlineStore().isOnline = false;
    const first = favorites.tracks[0];
    await favorites.toggle(first);
    expect(favorites.has(first)).toBe(false);

    await expect(favorites.toggle(first)).resolves.toBe(true);
    expect(favorites.has(first)).toBe(true);
    expect(favorites.tracks[0]).toEqual(first);
    expect(favorites.removalBuffer).toHaveLength(0);
  });

  it('офлайн: новый лайк подавлен (null), сети не было', async () => {
    loginAsUser();
    useOnlineStore().isOnline = true;
    const favorites = useFavoritesStore();
    await flushPromises();

    useOnlineStore().isOnline = false;
    const fresh = makeTrack('t9');
    await expect(favorites.toggle(fresh)).resolves.toBeNull();
    expect(favorites.has(fresh)).toBe(false);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('офлайн-сортировка: перенос локальный и в буфер, при коннекте уходит PATCH-ами (баг 21)', async () => {
    // Сервер применяет «один перенос» к своему порядку.
    const server = { ...PAYLOAD, tracks: [makeTrack('t1'), makeTrack('t2')] };
    fetchMock.mockResolvedValue(server);
    moveMock.mockImplementation(async (_type, snapshot, to) => {
      const index = server.tracks.findIndex((track) => track.source_id === snapshot.source_id);
      const [moved] = server.tracks.splice(index, 1);
      if (moved) server.tracks.splice(to, 0, moved);
      return { updated: 1 };
    });

    loginAsUser();
    useOnlineStore().isOnline = true;
    const favorites = useFavoritesStore();
    await flushPromises();

    useOnlineStore().isOnline = false;
    favorites.reorder(0, 1);
    expect(favorites.tracks.map((t) => t.source_id)).toEqual(['t2', 't1']);
    expect(moveMock).not.toHaveBeenCalled();
    await flushPromises();

    // Сеть вернулась: буфер уходит переносом, порядок сходится с сервером.
    useOnlineStore().noteSocketConnected();
    await flushPromises();
    await flushPromises();

    expect(moveMock).toHaveBeenCalledWith('track', { source_type: 'yandex_music', source_id: 't1' }, 1);
    expect(favorites.tracks.map((t) => t.source_id)).toEqual(['t2', 't1']);
  });

  it('коннект: буфер уходит DELETE-ами, список сходится с сервером', async () => {
    // Сервер-side состояние: DELETE реально убирает трек из выдачи.
    const server = { ...PAYLOAD, tracks: [makeTrack('t1'), makeTrack('t2')] };
    fetchMock.mockResolvedValue(server);
    removeMock.mockImplementation(async (snapshot) => {
      server.tracks = server.tracks.filter((track) => track.source_id !== snapshot.source_id);
      return { message: 'ок' };
    });

    loginAsUser();
    useOnlineStore().isOnline = true;
    const favorites = useFavoritesStore();
    await flushPromises();

    useOnlineStore().isOnline = false;
    const first = favorites.tracks[0];
    await favorites.toggle(first);
    expect(removeMock).not.toHaveBeenCalled();

    // Сеть вернулась: flush буфера + повторный fetch для конвергенции.
    useOnlineStore().noteSocketConnected();
    await flushPromises();
    await flushPromises();

    expect(removeMock).toHaveBeenCalledWith(first);
    expect(favorites.removalBuffer).toHaveLength(0);
    expect(favorites.has(first)).toBe(false);
    expect(favorites.tracks.map((t) => t.source_id)).toEqual(['t2']);
  });
});
