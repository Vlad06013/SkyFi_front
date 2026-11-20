import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import {
  acceptFriendRequest,
  addToFriendQueue,
  fetchFriendProfile,
  fetchFriendshipOverview,
  fetchFriendNowPlaying,
  fetchFriendQueue,
  removeFriend,
  reorderFriendQueue,
  searchUsers,
  sendFriendRequest,
  shareWithFriend,
} from '@/api/friends';
import type { TrackSnapshot } from '@/types';

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

const getMock = vi.mocked(http.get);
const postMock = vi.mocked(http.post);
const deleteMock = vi.mocked(http.delete);
const patchMock = vi.mocked(http.patch);

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

describe('api/friends', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    patchMock.mockReset();
  });

  it('GET friends: обзор без параметров', async () => {
    getMock.mockResolvedValue({ friends: [], incoming: [], outgoing: [] } as never);
    await fetchFriendshipOverview();
    expect(getMock).toHaveBeenCalledWith('friends', { params: {} });
  });

  it('GET friends: section и q в query', async () => {
    getMock.mockResolvedValue({ friends: [], incoming: [], outgoing: [] } as never);
    await fetchFriendshipOverview({ section: 'incoming', q: 'аня' });
    expect(getMock).toHaveBeenCalledWith('friends', { params: { section: 'incoming', q: 'аня' } });
  });

  it('GET friends/search-users с q', async () => {
    getMock.mockResolvedValue([] as never);
    await searchUsers('аня');
    expect(getMock).toHaveBeenCalledWith('friends/search-users', { params: { q: 'аня' } });
  });

  it('POST friends/request: user_id в теле', async () => {
    postMock.mockResolvedValue({} as never);
    await sendFriendRequest(7);
    expect(postMock).toHaveBeenCalledWith('friends/request', { user_id: 7 });
  });

  it('POST friends/{userId}/accept: принять входящую заявку', async () => {
    postMock.mockResolvedValue({} as never);
    await acceptFriendRequest(3);
    expect(postMock).toHaveBeenCalledWith('friends/3/accept');
  });

  it('DELETE friends/{userId}: отклонить/отменить/расфрендить', async () => {
    deleteMock.mockResolvedValue({} as never);
    await removeFriend(3);
    expect(deleteMock).toHaveBeenCalledWith('friends/3');
  });

  it('GET профиль/now-playing/очередь друга по user id', async () => {
    getMock.mockResolvedValue({} as never);
    await fetchFriendProfile(2);
    await fetchFriendNowPlaying(2);
    await fetchFriendQueue(2);
    expect(getMock).toHaveBeenCalledWith('friends/2');
    expect(getMock).toHaveBeenCalledWith('friends/2/now-playing');
    expect(getMock).toHaveBeenCalledWith('friends/2/queue');
  });

  it('PATCH reorder очереди друга: items в теле', async () => {
    patchMock.mockResolvedValue([] as never);
    await reorderFriendQueue(2, [3, 1]);
    expect(patchMock).toHaveBeenCalledWith('friends/2/queue/reorder', { items: [3, 1] });
  });

  it('POST в очередь друга и шара: снапшот в теле', async () => {
    postMock.mockResolvedValue({} as never);
    await addToFriendQueue(2, track);
    await shareWithFriend(2, track);
    expect(postMock).toHaveBeenCalledWith('friends/2/queue', track);
    expect(postMock).toHaveBeenCalledWith('friends/2/share', track);
  });
});
