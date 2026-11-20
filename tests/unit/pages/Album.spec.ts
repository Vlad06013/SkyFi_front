import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { ApiError } from '@/api/http';
import * as detailsApi from '@/api/details';
import Album from '@/pages/Album/Album.vue';
import { useToastStore } from '@/stores/toast';
import type { EntityDetailsPayload, TrackSnapshot } from '@/types';

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  params: { source: 'yandex_music', id: '43334443' } as Record<string, string>,
}));

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  return {
    ...actual,
    useRoute: () => ({ name: 'album', params: routerMocks.params }),
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

function makeDetails(overrides: Partial<EntityDetailsPayload> = {}): EntityDetailsPayload {
  return {
    entity: {
      type: 'album',
      source_type: 'yandex_music',
      source_id: '43334443',
      title: 'Legacy',
      artists: [{ name: 'FFDP' }],
      year: '2026',
      cover_url: null,
      track_count: 2,
    },
    tracks: { items: [makeTrack('t1'), makeTrack('t2')], total: 2, has_more: false },
    albums: { items: [], total: 0, has_more: false },
    ...overrides,
  };
}

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(Album, { global: { plugins: [pinia] } });
}

function vmLoadMore(wrapper: VueWrapper) {
  (wrapper.vm as unknown as { loadMore: () => void }).loadMore();
}

describe('pages/Album', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    routerMocks.push.mockReset();
    fetchMock.mockReset();
  });

  it('грузит детали по source/id из роута и рисует hero + треки', async () => {
    fetchMock.mockResolvedValue(makeDetails());
    const wrapper = mountPage();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      { type: 'album', source_type: 'yandex_music', source_id: '43334443' },
      { page: 1, limit: 50 },
    );
    expect(wrapper.find('.hero-name').text()).toBe('Legacy');
    expect(wrapper.findAll('.track-row')).toHaveLength(2);
  });

  it('ошибка → тост «Не удалось загрузить» + инлайн «Повторить»; retry догоняет', async () => {
    fetchMock
      .mockRejectedValueOnce(new ApiError(503, 'server', 'Сервер недоступен.'))
      .mockResolvedValueOnce(makeDetails());
    const wrapper = mountPage();
    await flushPromises();

    const toast = useToastStore().toast;
    expect(toast?.error).toBe(true);
    expect(toast?.title).toBe('Не удалось загрузить');
    expect(wrapper.find('.empty .et').text()).toBe('Не удалось загрузить');

    await wrapper.find('.btn').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('.track-row')).toHaveLength(2);
  });

  it('догрузка: page++ дописывает треки, сентинел при has_more', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeDetails({
          tracks: { items: [makeTrack('t1')], total: 2, has_more: true },
        }),
      )
      .mockResolvedValueOnce(
        makeDetails({
          tracks: { items: [makeTrack('t2')], total: 2, has_more: false },
        }),
      );
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('.more-sentinel').exists()).toBe(true);

    vmLoadMore(wrapper);
    await flushPromises();

    expect(fetchMock).toHaveBeenLastCalledWith(
      { type: 'album', source_type: 'yandex_music', source_id: '43334443' },
      { page: 2, limit: 50 },
    );
    expect(wrapper.findAll('.track-row')).toHaveLength(2);
    expect(wrapper.find('.more-sentinel').exists()).toBe(false);
  });
});
