import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { incomingRequest } from '@/mocks/friends';

export interface ShareNotice {
  id: number;
  title: string;
  sub: string;
  unread: boolean;
}

export const useNotificationsStore = defineStore('notifications', () => {
  const open = ref(false);
  const request = ref<{ id: number; name: string; initial: string; tone: 'g1' } | null>(incomingRequest);
  const shares = ref<ShareNotice[]>([
    { id: 1, title: 'Радиотишина', sub: 'Илья поделился · трек · в плеер', unread: true },
    { id: 2, title: 'Heaven :x: Hell', sub: 'Аня поделилась · альбом · в избранное', unread: true },
    { id: 3, title: 'В дорогу', sub: 'Макс поделился · плейлист', unread: false },
  ]);

  const unreadCount = computed(
    () => (request.value ? 1 : 0) + shares.value.filter((share) => share.unread).length,
  );
  const hasUnread = computed(() => unreadCount.value > 0);

  function toggle() {
    open.value = !open.value;
  }

  function close() {
    open.value = false;
  }

  function accept() {
    request.value = null;
    open.value = false;
  }

  function decline() {
    request.value = null;
    open.value = false;
  }

  function markRead(id: number) {
    shares.value = shares.value.map((share) =>
      share.id === id ? { ...share, unread: false } : share,
    );
  }

  function markAllRead() {
    shares.value = shares.value.map((share) => ({ ...share, unread: false }));
  }

  return {
    open,
    request,
    shares,
    unreadCount,
    hasUnread,
    toggle,
    close,
    accept,
    decline,
    markRead,
    markAllRead,
  };
});
