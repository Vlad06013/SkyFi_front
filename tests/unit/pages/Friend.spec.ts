import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import * as friendsApi from '@/api/friends';
import Friend from '@/pages/Friend/Friend.vue';

const routerMocks = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
const routeMock = vi.hoisted(() => ({
  current: { params: { id: '3' } as { id?: string } },
}));

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  const { reactive } = await import('vue');
  routeMock.current = reactive(routeMock.current);
  return {
    ...actual,
    useRoute: () => routeMock.current,
    useRouter: () => ({ push: routerMocks.push, back: routerMocks.back }),
  };
});

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

const profileMock = vi.mocked(friendsApi.fetchFriendProfile);
const nowPlayingMock = vi.mocked(friendsApi.fetchFriendNowPlaying);
const favoritesMock = vi.mocked(friendsApi.fetchFriendFavorites);
const overviewMock = vi.mocked(friendsApi.fetchFriendshipOverview);
const removeMock = vi.mocked(friendsApi.removeFriend);

describe('pages/Friend', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    profileMock.mockReset();
    nowPlayingMock.mockReset();
    favoritesMock.mockReset();
    overviewMock.mockReset();
    removeMock.mockReset();
    routerMocks.back.mockReset();
    routeMock.current.params.id = '3';
    overviewMock.mockResolvedValue({ friends: [], incoming: [], outgoing: [] } as never);
    profileMock.mockResolvedValue({ id: 3, name: 'Аня', email: 'anya@mail.ru', avatar_url: null } as never);
    nowPlayingMock.mockResolvedValue({ is_playing: false, snapshot: null } as never);
    favoritesMock.mockResolvedValue({
      tracks: [], videos: [], albums: [], artists: [], playlists: [],
    } as never);
  });

  function mountPage() {
    const pinia = createPinia();
    setActivePinia(pinia);
    return mount(Friend, { global: { plugins: [pinia], stubs: { teleport: true } } });
  }

  it('грузит данные друга по id из роута', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(profileMock).toHaveBeenCalledWith(3);
    expect(nowPlayingMock).toHaveBeenCalledWith(3);
    expect(favoritesMock).toHaveBeenCalledWith(3);
    expect(wrapper.find('.f-name').text()).toBe('Аня');
  });

  it('уход со страницы (параметр роута пропал) не дёргает запросы с NaN', async () => {
    mountPage();
    await flushPromises();
    expect(profileMock).toHaveBeenCalledTimes(1);

    // keep-alive: компонент жив, роут ушёл — id параметра больше нет
    routeMock.current.params.id = undefined;
    await flushPromises();

    expect(profileMock).toHaveBeenCalledTimes(1);
    expect(profileMock).not.toHaveBeenCalledWith(NaN);
    expect(nowPlayingMock).not.toHaveBeenCalledWith(NaN);
    expect(favoritesMock).not.toHaveBeenCalledWith(NaN);
  });

  it('удаление друга идёт через подтверждение', async () => {
    removeMock.mockResolvedValue({} as never);
    const wrapper = mountPage();
    await flushPromises();
    expect(removeMock).not.toHaveBeenCalled();

    await wrapper.find('.btn-danger').trigger('click');
    expect(wrapper.text()).toContain('Удалить из друзей?');

    await wrapper.findAll('.confirm-btn')[0].trigger('click');
    await flushPromises();

    expect(removeMock).toHaveBeenCalledWith(3);
    expect(routerMocks.back).toHaveBeenCalled();
  });
});
