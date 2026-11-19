import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { ApiError } from '@/api/http';
import * as searchApi from '@/api/search';
import { getSearchHistory, pushSearchHistory } from '@/lib/search-history';
import { useOnlineStore } from '@/stores/online';
import Search from '@/pages/Search/Search.vue';
import type { ArtistSnapshot, SearchPagePayload, TrackSnapshot } from '@/types';

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  return {
    ...actual,
    useRouter: () => ({ push: routerMocks.push }),
  };
});

vi.mock('@/api/search', () => ({
  fetchSearch: vi.fn(),
}));

vi.mock('@/lib/search-history', () => ({
  getSearchHistory: vi.fn(),
  pushSearchHistory: vi.fn(),
}));

const fetchMock = vi.mocked(searchApi.fetchSearch);
const getHistoryMock = vi.mocked(getSearchHistory);
const pushHistoryMock = vi.mocked(pushSearchHistory);

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

function makePayload(overrides: Partial<SearchPagePayload> = {}): SearchPagePayload {
  return {
    query: 'sum 41',
    page: 1,
    best: null,
    tracks: { items: [], total: 0, has_more: false },
    albums: { items: [], total: 0, has_more: false },
    artists: { items: [], total: 0, has_more: false },
    playlists: { items: [], total: 0, has_more: false },
    videos: { items: [], total: 0, has_more: false },
    ...overrides,
  };
}

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(Search, { global: { plugins: [pinia] } });
}

async function typeAndSearch(wrapper: VueWrapper, value: string) {
  await wrapper.find('input').setValue(value);
  await vi.advanceTimersByTimeAsync(400);
  await flushPromises();
}

async function openSection(wrapper: VueWrapper, name: string) {
  const pill = wrapper.findAll('.chip').find((chip) => chip.text() === name);
  expect(pill).toBeDefined();
  await pill!.trigger('click');
  await flushPromises();
}

function vmLoadMore(wrapper: VueWrapper) {
  (wrapper.vm as unknown as { loadMore: () => void }).loadMore();
}

describe('pages/Search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    routerMocks.push.mockReset();
    fetchMock.mockReset();
    getHistoryMock.mockReset();
    pushHistoryMock.mockReset();
    getHistoryMock.mockResolvedValue([]);
    pushHistoryMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('короткий запрос не дёргает сеть и просит минимум 2 символа', async () => {
    const wrapper = mountPage();
    await typeAndSearch(wrapper, 's');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('минимум 2 символа');
  });

  it('дебаунс: один запрос после паузы во вводе', async () => {
    const wrapper = mountPage();
    await wrapper.find('input').setValue('su');
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).not.toHaveBeenCalled();

    await wrapper.find('input').setValue('sum 41');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith({ q: 'sum 41', limit: 20, page: 1 });
  });

  it('выдача: лучшее совпадение (название, обложка, is_favorite) и треки', async () => {
    fetchMock.mockResolvedValue(
      makePayload({
        best: {
          ...makeArtist('6964'),
          title: 'Five Finger Death Punch',
          cover_url: 'https://avatars.yandex.net/get-music-content/42108/4e50e6dc.p.6964/200x200',
          is_favorite: true,
        },
        tracks: {
          items: [
            { ...makeTrack('t1'), is_favorite: true },
            { ...makeTrack('t2'), is_favorite: false },
          ],
          total: 2,
          has_more: false,
        },
      }),
    );
    const wrapper = mountPage();
    await typeAndSearch(wrapper, 'sum 41');

    const bestRow = wrapper.find('.pl-row');
    expect(bestRow.exists()).toBe(true);
    expect(bestRow.text()).toContain('Five Finger Death Punch');
    expect(bestRow.text()).toContain('Исполнитель');
    expect(bestRow.find('img').attributes('src')).toContain('avatars.yandex.net');
    expect(bestRow.find('.like-mark').exists()).toBe(true);

    await openSection(wrapper, 'Треки');
    const rows = wrapper.findAll('.track-row');
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.find('.like-mark').exists())).toHaveLength(1);
    expect(pushHistoryMock).toHaveBeenCalledWith('sum 41');
  });

  it('пустая секция рисует «Ничего не найдено»', async () => {
    fetchMock.mockResolvedValue(makePayload());
    const wrapper = mountPage();
    await typeAndSearch(wrapper, 'sum 41');

    await openSection(wrapper, 'Альбомы');
    expect(wrapper.text()).toContain('Ничего не найдено');
  });

  it('догрузка по прокрутке: page++, треки дописываются, сентинел живёт при has_more', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makePayload({
          page: 1,
          tracks: {
            items: [
              { ...makeTrack('t1'), is_favorite: false },
              { ...makeTrack('t2'), is_favorite: false },
            ],
            total: 4,
            has_more: true,
          },
        }),
      )
      .mockResolvedValueOnce(
        makePayload({
          page: 2,
          tracks: {
            items: [
              { ...makeTrack('t3'), is_favorite: false },
              { ...makeTrack('t4'), is_favorite: false },
            ],
            total: 4,
            has_more: false,
          },
        }),
      );
    const wrapper = mountPage();
    await typeAndSearch(wrapper, 'sum 41');
    await openSection(wrapper, 'Треки');

    expect(wrapper.find('.more-sentinel').exists()).toBe(true);

    vmLoadMore(wrapper);
    await flushPromises();

    expect(fetchMock).toHaveBeenLastCalledWith({ q: 'sum 41', limit: 20, page: 2 });
    expect(wrapper.findAll('.track-row')).toHaveLength(4);
    expect(wrapper.find('.more-sentinel').exists()).toBe(false);
  });

  it('ошибка первой страницы → блок с повтором; повтор догоняет выдачу', async () => {
    fetchMock
      .mockRejectedValueOnce(new ApiError(429, 'rate-limit', 'Слишком часто. Подождите.'))
      .mockResolvedValueOnce(
        makePayload({
          tracks: { items: [{ ...makeTrack('t1'), is_favorite: false }], total: 1, has_more: false },
        }),
      );
    const wrapper = mountPage();
    await typeAndSearch(wrapper, 'sum 41');

    expect(wrapper.text()).toContain('Слишком часто. Подождите.');

    await wrapper.find('.btn').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    await openSection(wrapper, 'Треки');
    expect(wrapper.findAll('.track-row')).toHaveLength(1);
  });

  it('офлайн: запрос не уходит, рисуется офлайн-блок', async () => {
    const wrapper = mountPage();
    useOnlineStore().isOnline = false;
    await typeAndSearch(wrapper, 'sum 41');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Нет соединения');
  });

  it('клик по альбому ведёт на страницу альбома', async () => {
    fetchMock.mockResolvedValue(
      makePayload({
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
      }),
    );
    const wrapper = mountPage();
    await typeAndSearch(wrapper, 'sum 41');
    await openSection(wrapper, 'Альбомы');

    await wrapper.find('.pl-row').trigger('click');
    expect(routerMocks.push).toHaveBeenCalledWith('/album/yandex_music/al1');
  });

  it('история подставляет запрос из чипа', async () => {
    getHistoryMock.mockResolvedValue(['би-2']);
    fetchMock.mockResolvedValue(makePayload());
    const wrapper = mountPage();
    await flushPromises();

    const chip = wrapper.findAll('.chip').find((c) => c.text() === 'би-2');
    expect(chip).toBeDefined();
    await chip!.trigger('click');
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith({ q: 'би-2', limit: 20, page: 1 });
  });
});
