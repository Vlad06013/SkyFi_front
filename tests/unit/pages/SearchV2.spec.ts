import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { ApiError } from '@/api/http';
import * as searchApi from '@/api/search';
import { getSearchHistory, pushSearchHistory, clearSearchHistory } from '@/lib/search-history';
import { useOnlineStore } from '@/stores/online';
import SearchV2 from '@/pages/SearchV2/SearchV2.vue';
import type { ArtistSnapshot, SearchSourcePagePayload, TrackSnapshot, VideoSnapshot } from '@/types';

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  return {
    ...actual,
    useRoute: () => ({ name: 'search' }),
    useRouter: () => ({ push: routerMocks.push }),
  };
});

vi.mock('@/api/search', () => ({
  fetchSearch: vi.fn(),
  fetchSearchV2: vi.fn(),
}));

vi.mock('@/lib/search-history', () => ({
  getSearchHistory: vi.fn(),
  pushSearchHistory: vi.fn(),
  clearSearchHistory: vi.fn(),
}));

const fetchMock = vi.mocked(searchApi.fetchSearchV2);
const getHistoryMock = vi.mocked(getSearchHistory);
const pushHistoryMock = vi.mocked(pushSearchHistory);
const clearHistoryMock = vi.mocked(clearSearchHistory);

function makeTrack(id: string, patch: Partial<TrackSnapshot> = {}): TrackSnapshot {
  return {
    type: 'track',
    source_type: 'yandex_music',
    source_id: id,
    title: `Трек ${id}`,
    artists: [{ name: 'Sum 41' }],
    duration_ms: null,
    cover_url: null,
    album: null,
    stream_url: null,
    ...patch,
  };
}

function makeVideo(id: string): VideoSnapshot {
  return {
    type: 'video',
    source_type: 'youtube',
    source_id: id,
    title: `Ролик ${id}`,
    artists: [{ name: 'Канал' }],
    duration_ms: 125000,
    cover_url: null,
    watch_url: null,
  };
}

function makeArtist(id: string): ArtistSnapshot {
  return {
    type: 'artist',
    source_type: 'yandex_music',
    source_id: id,
    title: 'Sum 41',
    artists: [],
    cover_url: null,
  };
}

function makePayload(overrides: Partial<SearchSourcePagePayload> = {}): SearchSourcePagePayload {
  return {
    query: 'sum 41',
    page: 1,
    resource: 'yandex_music',
    best: null,
    sections: {},
    ...overrides,
  };
}

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(SearchV2, { global: { plugins: [pinia] } });
}

async function typeAndSearch(wrapper: VueWrapper, value: string) {
  await wrapper.find('input').setValue(value);
  await vi.advanceTimersByTimeAsync(1000);
  await flushPromises();
}

async function clickChip(wrapper: VueWrapper, name: string) {
  const pill = wrapper.findAll('.chip').find((chip) => chip.text() === name);
  expect(pill).toBeDefined();
  await pill!.trigger('click');
  await flushPromises();
}

async function clickResource(wrapper: VueWrapper, name: string) {
  const button = wrapper.findAll('.src-ico').find((item) => item.text() === name);
  expect(button).toBeDefined();
  await button!.trigger('click');
  await flushPromises();
}

describe('pages/SearchV2', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    routerMocks.push.mockReset();
    fetchMock.mockReset();
    getHistoryMock.mockReset();
    pushHistoryMock.mockReset();
    clearHistoryMock.mockReset();
    getHistoryMock.mockResolvedValue([]);
    pushHistoryMock.mockResolvedValue([]);
    clearHistoryMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('до запроса уже выбраны Яндекс и Лучшее, сеть молчит', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.find('.src-ico.on').text()).toContain('Яндекс');
    expect(wrapper.find('.chip.active').text()).toBe('Лучшее');
    expect(wrapper.text()).toContain('Треки');
    expect(wrapper.text()).toContain('Плейлисты');
    expect(wrapper.text()).not.toContain('Видео');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('короткий запрос не дёргает сеть', async () => {
    const wrapper = mountPage();
    await typeAndSearch(wrapper, 's');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('минимум 2 символа');
  });

  it('дебаунс: Лучшее уходит без section, resource и type уже выбраны', async () => {
    const wrapper = mountPage();
    await wrapper.find('input').setValue('su');
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).not.toHaveBeenCalled();

    await wrapper.find('input').setValue('sum 41');
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      { q: 'sum 41', resource: 'yandex_music', type: 'audio', limit: 20, page: 1 },
      expect.any(AbortSignal),
    );
  });

  it('пилюля Треки до запроса уходит в section вместе со строкой', async () => {
    fetchMock.mockResolvedValue(makePayload());
    const wrapper = mountPage();
    await clickChip(wrapper, 'Треки');
    expect(fetchMock).not.toHaveBeenCalled();

    await typeAndSearch(wrapper, 'sum 41');
    expect(fetchMock).toHaveBeenCalledWith(
      { q: 'sum 41', resource: 'yandex_music', type: 'audio', section: 'tracks', limit: 20, page: 1 },
      expect.any(AbortSignal),
    );
  });

  it('YouTube рисует ролики плитками, не списком', async () => {
    fetchMock.mockResolvedValue(
      makePayload({
        resource: 'youtube',
        sections: {
          videos: {
            items: [{ ...makeVideo('v1'), is_favorite: false }],
            total: 1,
            has_more: false,
          },
        },
      }),
    );
    const wrapper = mountPage();
    await clickResource(wrapper, 'YouTube');
    await typeAndSearch(wrapper, 'sum 41');
    expect(wrapper.findAll('.vid-tile')).toHaveLength(1);
    expect(wrapper.find('.vid-tile').text()).toContain('Ролик v1');
    expect(wrapper.find('.vid-time').text()).toBe('2:05');
    expect(wrapper.find('.vid-row').exists()).toBe(false);
  });

  it('YouTube — одна пилюля Видео и type=video', async () => {
    fetchMock.mockResolvedValue(makePayload({ resource: 'youtube', sections: {} }));
    const wrapper = mountPage();
    await clickResource(wrapper, 'YouTube');

    expect(wrapper.find('.chip.active').text()).toBe('Видео');
    expect(wrapper.findAll('.sec-row .chip')).toHaveLength(1);

    await typeAndSearch(wrapper, 'sum 41');
    expect(fetchMock).toHaveBeenCalledWith(
      { q: 'sum 41', resource: 'youtube', type: 'video', section: 'videos', limit: 20, page: 1 },
      expect.any(AbortSignal),
    );
  });

  it('смена источника сбрасывает пилюлю Яндекса на Лучшее', async () => {
    fetchMock.mockResolvedValue(makePayload());
    const wrapper = mountPage();
    await clickChip(wrapper, 'Альбомы');
    await clickResource(wrapper, 'Дзен');
    expect(wrapper.find('.chip.active').text()).toBe('Видео');

    await clickResource(wrapper, 'Яндекс');
    expect(wrapper.find('.chip.active').text()).toBe('Лучшее');
  });

  it('выдача: лучшее совпадение и треки', async () => {
    fetchMock.mockResolvedValue(
      makePayload({
        best: { ...makeArtist('6964'), title: 'Five Finger Death Punch', is_favorite: true },
        sections: {
          tracks: {
            items: [
              { ...makeTrack('t1'), is_favorite: true },
              { ...makeTrack('t2'), is_favorite: false },
            ],
            total: 2,
            has_more: false,
          },
        },
      }),
    );
    const wrapper = mountPage();
    await typeAndSearch(wrapper, 'sum 41');

    const bestRow = wrapper.find('.pl-row');
    expect(bestRow.text()).toContain('Five Finger Death Punch');
    expect(bestRow.find('.like-mark').exists()).toBe(true);

    fetchMock.mockResolvedValue(
      makePayload({
        sections: {
          tracks: {
            items: [
              { ...makeTrack('t1'), is_favorite: true },
              { ...makeTrack('t2'), is_favorite: false },
            ],
            total: 2,
            has_more: false,
          },
        },
      }),
    );
    await clickChip(wrapper, 'Треки');
    expect(wrapper.findAll('.track-row')).toHaveLength(2);
    expect(pushHistoryMock).toHaveBeenCalledWith('sum 41');
  });

  it('пустая секция рисует «Ничего не найдено»', async () => {
    fetchMock.mockResolvedValue(makePayload());
    const wrapper = mountPage();
    await clickChip(wrapper, 'Альбомы');
    await typeAndSearch(wrapper, 'sum 41');
    expect(wrapper.text()).toContain('Ничего не найдено');
  });

  it('догрузка шлёт page++ той же секции, пустая страница останавливает', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makePayload({
          sections: {
            tracks: {
              items: [
                { ...makeTrack('t1'), is_favorite: false },
                { ...makeTrack('t2'), is_favorite: false },
              ],
              total: 3,
              has_more: false,
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        makePayload({
          page: 2,
          sections: {
            tracks: { items: [{ ...makeTrack('t3'), is_favorite: false }], total: 3, has_more: false },
          },
        }),
      )
      .mockResolvedValueOnce(makePayload({ page: 3, sections: { tracks: { items: [], total: 3, has_more: false } } }));

    const wrapper = mountPage();
    await clickChip(wrapper, 'Треки');
    await typeAndSearch(wrapper, 'sum 41');
    expect(wrapper.find('.more-sentinel').exists()).toBe(true);

    (wrapper.vm as unknown as { loadMore: () => void }).loadMore();
    await flushPromises();
    expect(fetchMock).toHaveBeenLastCalledWith(
      { q: 'sum 41', resource: 'yandex_music', type: 'audio', section: 'tracks', limit: 20, page: 2 },
      expect.any(AbortSignal),
    );
    expect(wrapper.findAll('.track-row')).toHaveLength(3);

    (wrapper.vm as unknown as { loadMore: () => void }).loadMore();
    await flushPromises();
    expect(wrapper.findAll('.track-row')).toHaveLength(3);
    expect(wrapper.find('.more-sentinel').exists()).toBe(false);
  });

  it('ошибка первой страницы повторяется тем же запросом', async () => {
    fetchMock
      .mockRejectedValueOnce(new ApiError(429, 'rate-limit', 'Слишком часто. Подождите.'))
      .mockResolvedValueOnce(
        makePayload({
          sections: { tracks: { items: [{ ...makeTrack('t1'), is_favorite: false }], total: 1, has_more: false } },
        }),
      );
    const wrapper = mountPage();
    await clickChip(wrapper, 'Треки');
    await typeAndSearch(wrapper, 'sum 41');
    expect(wrapper.text()).toContain('Слишком часто. Подождите.');

    await wrapper.find('.btn').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('.track-row')).toHaveLength(1);
  });

  it('офлайн не ходит в сеть', async () => {
    const wrapper = mountPage();
    useOnlineStore().isOnline = false;
    await typeAndSearch(wrapper, 'sum 41');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Лучшего совпадения нет');
  });

  it('клик по альбому ведёт на страницу альбома', async () => {
    fetchMock.mockResolvedValue(
      makePayload({
        sections: {
          albums: {
            items: [
              {
                type: 'album',
                source_type: 'yandex_music',
                source_id: 'al1',
                title: 'Chuck',
                artists: [{ name: 'Sum 41' }],
                year: '2004',
                cover_url: null,
                track_count: 13,
                is_favorite: false,
              },
            ],
            total: 1,
            has_more: false,
          },
        },
      }),
    );
    const wrapper = mountPage();
    await clickChip(wrapper, 'Альбомы');
    await typeAndSearch(wrapper, 'sum 41');
    await wrapper.find('.pl-row').trigger('click');
    expect(routerMocks.push).toHaveBeenCalledWith('/album/yandex_music/al1');
  });

  it('история подставляет строку в уже выбранный источник', async () => {
    getHistoryMock.mockResolvedValue(['би-2']);
    fetchMock.mockResolvedValue(makePayload({ resource: 'skyfi' }));
    const wrapper = mountPage();
    await flushPromises();
    await clickResource(wrapper, 'SkyFi');

    const chip = wrapper.findAll('.hist .chip').find((item) => item.text() === 'би-2');
    expect(chip).toBeDefined();
    await chip!.trigger('click');
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    expect(wrapper.find('.chip.active').text()).toBe('Плейлисты');
    expect(fetchMock).toHaveBeenCalledWith(
      { q: 'би-2', resource: 'skyfi', type: 'audio', section: 'playlists', limit: 20, page: 1 },
      expect.any(AbortSignal),
    );
  });

  it('загрузки — одна пилюля Треки', async () => {
    const wrapper = mountPage();
    await clickResource(wrapper, 'Загрузки');
    expect(wrapper.findAll('.sec-row .chip')).toHaveLength(1);
    expect(wrapper.find('.chip.active').text()).toBe('Треки');
  });
});
