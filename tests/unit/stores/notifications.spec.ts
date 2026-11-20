import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { fetchShares } from '@/api/shares';
import { useFriendsStore } from '@/stores/friends';
import { useNotificationsStore } from '@/stores/notifications';
import type { ShareItem } from '@/api/shares';

vi.mock('@/api/shares', () => ({
  fetchShares: vi.fn(),
  fetchShareUrl: vi.fn(),
  removeShare: vi.fn(),
}));

const fetchSharesMock = vi.mocked(fetchShares);

const shareItem = (id: number): ShareItem => ({
  id,
  sender: { id: 9, name: 'Никита' },
  snapshot: {
    type: 'track',
    source_type: 'yandex_music',
    source_id: `${id}`,
    title: `Трек ${id}`,
    artists: [{ name: 'завтра' }],
    duration_ms: null,
    cover_url: null,
    album: null,
    stream_url: null,
  },
  created_at: '2026-11-20T00:00:00.000000Z',
});

describe('stores/notifications', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('ensure мапит GET /shares в ShareNotice (прочитанные)', async () => {
    fetchSharesMock.mockResolvedValue([shareItem(1), shareItem(2)]);
    const store = useNotificationsStore();

    store.ensure();
    await vi.waitFor(() => expect(store.sharesLoaded).toBe(true));

    expect(store.shares).toHaveLength(2);
    expect(store.shares[0]).toMatchObject({ id: 1, senderName: 'Никита', unread: false });
    expect(store.hasUnread).toBe(false);
  });

  it('неудача загрузки сбрасывает флажок — повторим при следующем ensure', async () => {
    fetchSharesMock.mockRejectedValue(new Error('down'));
    const store = useNotificationsStore();

    store.ensure();
    await vi.waitFor(() => expect(fetchSharesMock).toHaveBeenCalled());
    expect(store.sharesLoaded).toBe(false);
  });

  it('prependShare: новая шара сверху, непрочитанная, без дублей', () => {
    const store = useNotificationsStore();
    const item = { id: 5, senderName: 'Аня', snapshot: shareItem(5).snapshot };

    store.prependShare(item);
    store.prependShare(item);

    expect(store.shares).toHaveLength(1);
    expect(store.shares[0].unread).toBe(true);
    expect(store.unreadCount).toBe(1);
  });

  it('unreadCount считает и заявки (friends incoming), и непрочитанные шары', () => {
    const store = useNotificationsStore();
    const friends = useFriendsStore();
    friends.loaded = true;
    friends.incoming = [{ user: { id: 7, name: 'Макс', avatar_url: null, current_snapshot: null }, live: null, watching: false }];

    expect(store.unreadCount).toBe(1);

    store.prependShare({ id: 3, senderName: 'Аня', snapshot: shareItem(3).snapshot });
    expect(store.unreadCount).toBe(2);

    store.markAllRead();
    expect(store.unreadCount).toBe(1);
  });

  it('markRead гасит конкретную шару', () => {
    const store = useNotificationsStore();
    store.prependShare({ id: 3, senderName: 'Аня', snapshot: shareItem(3).snapshot });
    store.markRead(3);
    expect(store.shares[0].unread).toBe(false);
    expect(store.hasUnread).toBe(false);
  });

  it('reset чистит шары и флажки', async () => {
    fetchSharesMock.mockResolvedValue([shareItem(1)]);
    const store = useNotificationsStore();
    store.ensure();
    await vi.waitFor(() => expect(store.sharesLoaded).toBe(true));

    store.reset();
    expect(store.shares).toHaveLength(0);
    expect(store.sharesLoaded).toBe(false);
  });
});
