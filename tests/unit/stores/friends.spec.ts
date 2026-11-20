import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import * as friendsApi from '@/api/friends';
import { liveLine } from '@/lib/friends';
import { useAuthStore } from '@/stores/auth';
import { useFriendsStore } from '@/stores/friends';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
import type { FriendshipPayload, TrackSnapshot } from '@/types';

vi.mock('@/api/friends', () => ({
  fetchFriendshipOverview: vi.fn(),
  searchUsers: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptFriendship: vi.fn(),
  deleteFriendship: vi.fn(),
  fetchFriendProfile: vi.fn(),
  fetchFriendNowPlaying: vi.fn(),
  fetchFriendFavorites: vi.fn(),
  fetchFriendQueue: vi.fn(),
  reorderFriendQueue: vi.fn(),
  addToFriendQueue: vi.fn(),
  shareWithFriend: vi.fn(),
}));

const overviewMock = vi.mocked(friendsApi.fetchFriendshipOverview);
const acceptMock = vi.mocked(friendsApi.acceptFriendship);
const deleteMock = vi.mocked(friendsApi.deleteFriendship);
const sendMock = vi.mocked(friendsApi.sendFriendRequest);

const track: TrackSnapshot = {
  type: 'track',
  source_type: 'yandex_music',
  source_id: 't1',
  title: 'радиотишина',
  artists: [{ name: 'завтра' }],
  duration_ms: 200000,
  cover_url: null,
  album: null,
  stream_url: null,
};

/** Моя id = 1. senderId/receiverId — стороны дружбы. */
function makeFriendship(id: number, senderId: number, receiverId: number): FriendshipPayload {
  return {
    id,
    sender: { id: senderId, name: `User${senderId}`, avatar_url: null, current_snapshot: null },
    receiver: { id: receiverId, name: `User${receiverId}`, avatar_url: null, current_snapshot: null },
    status: 'pending',
    created_at: null,
  };
}

function authAsMe() {
  const auth = useAuthStore();
  auth.user = { id: 1, name: 'Я', email: 'me@skyfi.app', avatar_url: null };
  useOnlineStore().isOnline = true;
}

describe('stores/friends', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    overviewMock.mockReset();
    acceptMock.mockReset();
    deleteMock.mockReset();
    sendMock.mockReset();
  });

  it('автозагрузка: обзор мапится секциями, сторона — не я', async () => {
    overviewMock.mockResolvedValue({
      friends: [makeFriendship(1, 1, 3)],
      incoming: [makeFriendship(2, 2, 1)],
      outgoing: [makeFriendship(3, 1, 4)],
    } as never);
    authAsMe();
    const store = useFriendsStore();
    await flushPromises();

    expect(overviewMock).toHaveBeenCalledTimes(1);
    expect(store.friends.map((entry) => entry.user.id)).toEqual([3]);
    expect(store.incoming.map((entry) => entry.user.id)).toEqual([2]);
    expect(store.outgoing.map((entry) => entry.user.id)).toEqual([4]);
    expect(store.loaded).toBe(true);
  });

  it('live-строка из current_snapshot собеседника (видео — «· клип»)', () => {
    expect(liveLine(track)).toBe('радиотишина · завтра');
    expect(liveLine({ ...track, type: 'video', cover_url: null, watch_url: null })).toBe('радиотишина · клип');
    expect(liveLine(null)).toBeNull();
  });

  it('accept: заявка уходит из incoming, друг появляется в friends', async () => {
    const accepted = makeFriendship(2, 2, 1);
    acceptMock.mockResolvedValue(accepted as never);
    authAsMe();
    const store = useFriendsStore();
    store.incoming = [{ friendshipId: 2, user: accepted.sender, live: null, watching: false }];
    await flushPromises();

    await store.accept(2);

    expect(acceptMock).toHaveBeenCalledWith(2);
    expect(store.incoming).toHaveLength(0);
    expect(store.friends.map((entry) => entry.user.id)).toEqual([2]);
  });

  it('decline: DELETE + фильтр incoming; ошибка — тост', async () => {
    deleteMock.mockResolvedValue({} as never);
    authAsMe();
    const store = useFriendsStore();
    store.incoming = [
      { friendshipId: 2, user: { id: 2, name: 'User2', avatar_url: null, current_snapshot: null }, live: null, watching: false },
    ];

    await store.decline(2);

    expect(deleteMock).toHaveBeenCalledWith(2);
    expect(store.incoming).toHaveLength(0);

    deleteMock.mockRejectedValueOnce(new Error('offline'));
    await store.decline(2);
    expect(useToastStore().toast?.error).toBe(true);
  });

  it('sendRequest: дружба в outgoing, успех — id дружбы', async () => {
    sendMock.mockResolvedValue(makeFriendship(5, 1, 7) as never);
    authAsMe();
    const store = useFriendsStore();
    await flushPromises();

    const friendshipId = await store.sendRequest(7);

    expect(friendshipId).toBe(5);
    expect(sendMock).toHaveBeenCalledWith(7);
    expect(store.outgoing.map((entry) => entry.user.id)).toEqual([7]);
  });

  it('removeByUserId: подгружает обзор, находит дружбу, удаляет', async () => {
    overviewMock.mockResolvedValue({
      friends: [makeFriendship(1, 1, 3)],
      incoming: [],
      outgoing: [],
    } as never);
    deleteMock.mockResolvedValue({} as never);
    authAsMe();
    const store = useFriendsStore();

    const removed = await store.removeByUserId(3);

    expect(removed).toBe(true);
    expect(deleteMock).toHaveBeenCalledWith(1);
    expect(store.friends).toHaveLength(0);
  });

  it('выход чистит списки', async () => {
    overviewMock.mockResolvedValue({
      friends: [makeFriendship(1, 1, 3)],
      incoming: [],
      outgoing: [],
    } as never);
    authAsMe();
    const store = useFriendsStore();
    await flushPromises();
    expect(store.loaded).toBe(true);

    useAuthStore().user = null;
    await flushPromises();

    expect(store.friends).toHaveLength(0);
    expect(store.loaded).toBe(false);
  });
});
