import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Router } from 'vue-router';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    addListener: vi.fn(),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    createChannel: vi.fn(),
    schedule: vi.fn(),
  },
}));

vi.mock('@/lib/open-snapshot', () => ({ openSnapshot: vi.fn() }));

import { openSnapshot } from '@/lib/open-snapshot';
import { ackQueueReveal, queueRevealPending } from '@/lib/player-reveal';
import { openSocialTarget } from '@/lib/notify';
import { useNotificationsStore } from '@/stores/notifications';
import { usePlayerStore } from '@/stores/player';
import type { AnySnapshot } from '@/types';

const openSnapshotMock = vi.mocked(openSnapshot);

const track: AnySnapshot = {
  type: 'track',
  source_type: 'yandex_music',
  source_id: '1',
  title: 'Радиотишина',
  artists: [{ name: 'завтра' }],
  duration_ms: null,
  cover_url: null,
  album: null,
  stream_url: null,
};

function routerAt(path: string) {
  const push = vi.fn();
  const router = {
    push,
    currentRoute: { value: { fullPath: path, path } },
  } as unknown as Router;
  return { router, push };
}

describe('lib/notify openSocialTarget', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    openSnapshotMock.mockClear();
    ackQueueReveal();
  });

  it('заявка открывает друзей', () => {
    const { router, push } = routerAt('/home');
    openSocialTarget(router, { to: 'friends' });
    expect(push).toHaveBeenCalledWith('/friends');
  });

  it('уже открытые друзья не пушатся повторно', () => {
    const { router, push } = routerAt('/friends');
    openSocialTarget(router, { to: 'friends' });
    expect(push).not.toHaveBeenCalled();
  });

  it('шара открывает снапшот и гасит непрочитанность', () => {
    const { router } = routerAt('/home');
    const notifications = useNotificationsStore();
    notifications.prependShare({ id: 2, senderName: 'Никита', snapshot: track });

    openSocialTarget(router, { to: 'share', shareId: 2, snapshot: track });

    expect(openSnapshotMock).toHaveBeenCalledWith(router, track);
    expect(notifications.shares[0]?.unread).toBe(false);
  });

  it('очередь без текущего трека ведёт на главную', () => {
    const { router, push } = routerAt('/settings');
    openSocialTarget(router, { to: 'queue' });
    expect(push).toHaveBeenCalledWith('/home');
    expect(queueRevealPending()).toBe(true);
  });

  it('очередь при играющем треке не уводит со страницы', () => {
    const player = usePlayerStore();
    player.state.current_snapshot = track;
    const { router, push } = routerAt('/search');
    openSocialTarget(router, { to: 'queue' });
    expect(push).not.toHaveBeenCalled();
    expect(queueRevealPending()).toBe(true);
  });
});
