import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import * as detailsApi from '@/api/details';
import * as favoritesApi from '@/api/favorites';
import Playlist from '@/pages/Playlist/Playlist.vue';
import { useFavoritesStore } from '@/stores/favorites';
import type { EntityDetailsPayload, PlaylistSnapshot, TrackSnapshot } from '@/types';

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  params: { source: 'yandex_music', id: '457553308:6964' } as Record<string, string>,
}));

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  return {
    ...actual,
    useRoute: () => ({ params: routerMocks.params }),
    useRouter: () => ({ push: routerMocks.push }),
  };
});

vi.mock('@/api/details', () => ({
  fetchEntityDetails: vi.fn(),
}));

vi.mock('@/api/favorites', () => ({
  fetchFavorites: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  sortFavorites: vi.fn(),
}));

const fetchMock = vi.mocked(detailsApi.fetchEntityDetails);
const addMock = vi.mocked(favoritesApi.addFavorite);

function makeTrack(id: string): TrackSnapshot {
  return {
    type: 'track',
    source_type: 'yandex_music',
    source_id: id,
    title: `Трек ${id}`,
    artists: [{ name: 'FFDP' }],
    duration_ms: null,
    cover_url: null,
    album: null,
    stream_url: null,
  };
}

function makeEntity(): PlaylistSnapshot {
  return {
    type: 'playlist',
    source_type: 'yandex_music',
    source_id: '457553308:6964',
    title: 'Лучшее: FFDP',
    artists: [],
    owner_name: 'Яндекс Музька',
    cover_url: null,
    item_count: 2,
  };
}

function makeDetails(tracks: TrackSnapshot[] = [makeTrack('t1'), makeTrack('t2')]): EntityDetailsPayload {
  return {
    entity: makeEntity(),
    tracks: { items: tracks, total: tracks.length, has_more: false },
    albums: { items: [], total: 0, has_more: false },
  };
}

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(Playlist, { global: { plugins: [pinia] } });
}

describe('pages/Playlist', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    routerMocks.push.mockReset();
    fetchMock.mockReset();
    addMock.mockReset();
    addMock.mockResolvedValue({ message: 'ок', is_favorite: true });
  });

  it('hero плейлиста (владелец, число треков) + строки треков', async () => {
    fetchMock.mockResolvedValue(makeDetails());
    const wrapper = mountPage();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      { type: 'playlist', source_type: 'yandex_music', source_id: '457553308:6964' },
      { page: 1, limit: 50 },
    );
    expect(wrapper.find('.hero-name').text()).toBe('Лучшее: FFDP');
    expect(wrapper.findAll('.hero-sub')[1].text()).toContain('2 треков');
    expect(wrapper.findAll('.hero-sub')[1].text()).toContain('Яндекс Музька');
    expect(wrapper.findAll('.track-row')).toHaveLength(2);
  });

  it('лайк в hero добавляет в избранное', async () => {
    fetchMock.mockResolvedValue(makeDetails());
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.find('.hero-actions .icon-btn').trigger('click');
    await flushPromises();

    expect(addMock).toHaveBeenCalledTimes(1);
    expect(useFavoritesStore().has(makeEntity())).toBe(true);
  });

  it('пустой плейлист рисует empty-state', async () => {
    fetchMock.mockResolvedValue(makeDetails([]));
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.findAll('.track-row')).toHaveLength(0);
    expect(wrapper.text()).toContain('Пусто');
  });
});
