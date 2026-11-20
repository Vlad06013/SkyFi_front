import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import * as detailsApi from '@/api/details';
import Artist from '@/pages/Artist/Artist.vue';
import type { EntityDetailsPayload, TrackSnapshot } from '@/types';

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  name: 'artist' as string,
  params: { source: 'yandex_music', id: '6964' } as Record<string, string>,
}));

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  return {
    ...actual,
    useRoute: () => ({ name: routerMocks.name, params: routerMocks.params }),
    useRouter: () => ({ push: routerMocks.push }),
  };
});

vi.mock('@/api/details', () => ({
  fetchEntityDetails: vi.fn(),
}));

const fetchMock = vi.mocked(detailsApi.fetchEntityDetails);

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

function makeDetails(): EntityDetailsPayload {
  return {
    entity: {
      type: 'artist',
      source_type: 'yandex_music',
      source_id: '6964',
      title: 'Five Finger Death Punch',
      cover_url: null,
    },
    tracks: { items: [makeTrack('t1')], total: 1, has_more: false },
    albums: {
      items: [
        {
          type: 'album',
          source_type: 'yandex_music',
          source_id: 'al1',
          title: 'Legacy',
          artists: [],
          year: '2026',
          cover_url: null,
          track_count: 10,
        },
      ],
      total: 1,
      has_more: false,
    },
  };
}

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(Artist, { global: { plugins: [pinia] } });
}

describe('pages/Artist', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    routerMocks.push.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(makeDetails());
  });

  it('hero исполнителя + вкладка треков по умолчанию', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      { type: 'artist', source_type: 'yandex_music', source_id: '6964' },
      { page: 1, limit: 50 },
    );
    expect(wrapper.find('.hero-name').text()).toBe('Five Finger Death Punch');
    expect(wrapper.findAll('.track-row')).toHaveLength(1);
  });

  it('вкладка «Альбомы»: строки альбомов, клик ведёт на /album/:source/:id', async () => {
    const wrapper = mountPage();
    await flushPromises();

    await wrapper.findAll('.chip').find((chip) => chip.text() === 'Альбомы')!.trigger('click');
    await flushPromises();

    const row = wrapper.find('.pl-row');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain('2026');
    expect(row.text()).toContain('10 треков');

    await row.trigger('click');
    expect(routerMocks.push).toHaveBeenCalledWith('/album/yandex_music/al1');
  });

  it('keep-alive: под чужим роутом (album) страница artist НЕ шлёт /details', async () => {
    // Регрессия: живая artist-страница видит параметры album-роута и слала
    // запрос {type: artist, id альбома} → 422. Грузим только свой роут.
    routerMocks.name = 'album';
    routerMocks.params = { source: 'yandex_music', id: '35527045' };

    mountPage();
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();

    routerMocks.name = 'artist';
    routerMocks.params = { source: 'yandex_music', id: '6964' };
  });
});
