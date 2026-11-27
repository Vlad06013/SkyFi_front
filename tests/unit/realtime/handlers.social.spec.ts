import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  handleFriendQueueItemAdded,
  handleFriendshipRequestAccepted,
  handleFriendshipRequestSent,
  handleShareSent,
} from '@/realtime/handlers/social';
import { useFriendsStore } from '@/stores/friends';
import { useNotificationsStore } from '@/stores/notifications';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import * as queueApi from '@/api/queue';
import type { FriendshipPayload } from '@/types';

vi.mock('@/api/queue', () => ({
  fetchQueue: vi.fn(),
  addToQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  movePending: vi.fn(),
}));

const fetchQueueMock = vi.mocked(queueApi.fetchQueue);

const friendship = (senderId: number, receiverId: number, status = 'PENDING'): FriendshipPayload => ({
  id: 5,
  sender: { id: senderId, name: `user-${senderId}`, avatar_url: null, current_snapshot: null },
  receiver: { id: receiverId, name: `user-${receiverId}`, avatar_url: null, current_snapshot: null },
  status,
  created_at: null,
});

describe('realtime/handlers/social', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('request.sent: заявка попадает в incoming + тост', () => {
    const store = useFriendsStore();
    const toast = useToastStore();
    store.loaded = true;

    handleFriendshipRequestSent({ friendship: friendship(9, 1) });

    expect(store.incoming.map((e) => e.user.id)).toEqual([9]);
    expect(toast.toast?.title).toBe('user-9');
    expect(toast.toast?.who).toBe('заявка в друзья');
  });

  it('request.sent без friendship игнорируется', () => {
    const store = useFriendsStore();
    store.loaded = true;
    handleFriendshipRequestSent({ friendship: null as never });
    expect(store.incoming).toHaveLength(0);
  });

  it('request.accepted: убирает из outgoing, добавляет в friends + тост', () => {
    const store = useFriendsStore();
    const toast = useToastStore();
    store.loaded = true;
    store.outgoing = [{ user: friendship(7, 1).sender, live: null, watching: false }];

    handleFriendshipRequestAccepted({ friendship: friendship(7, 1, 'ACCEPTED') });

    expect(store.outgoing).toHaveLength(0);
    expect(store.friends.map((e) => e.user.id)).toEqual([7]);
    expect(toast.toast?.who).toBe('принял заявку');
  });

  it('friend.queue.item.added: тост + рефетч очереди', async () => {
    fetchQueueMock.mockResolvedValue([]);
    const toast = useToastStore();

    handleFriendQueueItemAdded({
      added_by: { id: 9, name: 'Никита' },
      item: { source_id: '1', title: 'Радиотишина', artists: ['завтра'] },
    });

    expect(toast.toast?.title).toBe('Радиотишина');
    expect(toast.toast?.who).toContain('Никита');
    await vi.waitFor(() => expect(fetchQueueMock).toHaveBeenCalled());
    expect(usePlayerStore().queueLoaded).toBe(true);
  });

  it('share.sent: шара в панель уведомлений + тост с именем и названием', () => {
    const toast = useToastStore();
    const notifications = useNotificationsStore();
    handleShareSent({
      share_id: 2,
      sender: { id: 9, name: 'Никита' },
      snapshot: {
        type: 'track',
        source_type: 'yandex_music',
        source_id: '1',
        title: 'Радиотишина',
        artists: [{ name: 'завтра' }],
        duration_ms: null,
        cover_url: null,
        album: null,
        stream_url: null,
      },
    });

    expect(toast.toast?.title).toBe('Радиотишина');
    expect(toast.toast?.who).toBe('Никита поделился');
    expect(notifications.shares).toHaveLength(1);
    expect(notifications.shares[0]).toMatchObject({ id: 2, senderName: 'Никита', unread: true });
    expect(notifications.unreadCount).toBe(1);
  });
});
