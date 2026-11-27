import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import * as friendsApi from '@/api/friends';
import * as sharesApi from '@/api/shares';
import MediaActionSheet from '@/components/MediaActionSheet/MediaActionSheet.vue';
import type { MenuEntity } from '@/lib/media-menu';
import type { TrackSnapshot } from '@/types';

vi.mock('@/api/shares', () => ({
  fetchShareUrl: vi.fn(),
}));

vi.mock('@/api/friends', () => ({
  fetchFriendshipOverview: vi.fn(),
  searchUsers: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
  fetchFriendProfile: vi.fn(),
  fetchFriendNowPlaying: vi.fn(),
  fetchFriendFavorites: vi.fn(),
  fetchFriendQueue: vi.fn(),
  moveFriendQueueItem: vi.fn(),
  addToFriendQueue: vi.fn(),
  shareWithFriend: vi.fn(),
}));

const shareUrlMock = vi.mocked(sharesApi.fetchShareUrl);
const overviewMock = vi.mocked(friendsApi.fetchFriendshipOverview);
const writeTextMock = vi.fn<() => Promise<void>>(() => Promise.resolve());

const track: TrackSnapshot = {
  type: 'track',
  source_type: 'yandex_music',
  source_id: '12345',
  title: 'радиотишина',
  artists: [{ name: 'завтра' }],
  duration_ms: 200000,
  cover_url: null,
  album: null,
  stream_url: null,
};

const entity: MenuEntity = {
  title: 'Радиотишина',
  artist: 'завтра',
  source: 'yandex_music',
  sourceId: '12345',
  snapshot: track,
};

function mountSheet(sheet: 'share') {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(MediaActionSheet, {
    props: { sheet, entity },
    global: { plugins: [pinia], stubs: { teleport: true } },
  });
}

describe('components/MediaActionSheet: share', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    shareUrlMock.mockReset();
    overviewMock.mockReset();
    overviewMock.mockResolvedValue({ friends: [], incoming: [], outgoing: [] } as never);
    writeTextMock.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });
  });

  it('ссылка запрашивается у бэка (POST /share-url) и копируется в буфер', async () => {
    shareUrlMock.mockResolvedValue({ url: 'https://music.yandex.ru/album/12345' } as never);
    const wrapper = mountSheet('share');
    await flushPromises();

    expect(shareUrlMock).toHaveBeenCalledWith(track);
    expect(writeTextMock).toHaveBeenCalledWith('https://music.yandex.ru/album/12345');
    expect(wrapper.text()).toContain('Ссылка уже в буфере');
  });

  it('ошибка бэка: тост и состояние «не удалось получить ссылку»', async () => {
    shareUrlMock.mockRejectedValue(new Error('Слишком часто. Подождите.'));
    const wrapper = mountSheet('share');
    await flushPromises();

    expect(writeTextMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('не удалось получить ссылку');
  });
});
