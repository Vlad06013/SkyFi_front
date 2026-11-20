import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { fetchShares } from '@/api/shares';
import { useAuthStore } from '@/stores/auth';
import { useFriendsStore } from '@/stores/friends';
import { useOnlineStore } from '@/stores/online';
import type { AnySnapshot } from '@/types';

/** Входящая шара для панели: то, что приходит в GET /shares + флаг непрочитанности. */
export interface ShareNotice {
  id: number;
  senderName: string;
  snapshot: AnySnapshot;
  unread: boolean;
}

export const useNotificationsStore = defineStore('notifications', () => {
  const open = ref(false);
  const shares = ref<ShareNotice[]>([]);
  /** Первичная загрузка GET /shares прошла (неудача сбрасывает — повторим). */
  const sharesLoaded = ref(false);

  const friends = useFriendsStore();
  /** Входящие заявки живут в friends store (incoming) — дублировать не будем. */
  const requests = computed(() => friends.incoming);

  const unreadCount = computed(
    () => requests.value.length + shares.value.filter((share) => share.unread).length,
  );
  const hasUnread = computed(() => unreadCount.value > 0);

  /** Ленивая загрузка шаров: при открытии панели и при входе/возврате онлайна. */
  function ensure() {
    if (sharesLoaded.value) return;
    void fetchShares()
      .then((items) => {
        shares.value = items.map((item) => ({
          id: item.id,
          senderName: item.sender.name,
          snapshot: item.snapshot,
          unread: false,
        }));
        sharesLoaded.value = true;
      })
      .catch(() => {
        sharesLoaded.value = false;
      });
  }

  /** Сокет share.sent: новая шара — вверх списка, непрочитанная. */
  function prependShare(item: { id: number; senderName: string; snapshot: AnySnapshot }) {
    if (shares.value.some((share) => share.id === item.id)) return;
    shares.value = [{ ...item, unread: true }, ...shares.value];
    sharesLoaded.value = true;
  }

  function toggle() {
    open.value = !open.value;
  }

  function close() {
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

  function reset() {
    shares.value = [];
    sharesLoaded.value = false;
    open.value = false;
  }

  // Автозагрузка как у друзей/избранного: вход + возврат онлайна; выход чистит.
  const auth = useAuthStore();
  const online = useOnlineStore();
  watch(
    () => [auth.isAuthed, online.isOnline] as const,
    ([authed, isOnline]) => {
      if (authed && isOnline) ensure();
      if (!authed) reset();
    },
    { immediate: true },
  );

  return {
    open,
    shares,
    sharesLoaded,
    requests,
    unreadCount,
    hasUnread,
    toggle,
    close,
    ensure,
    prependShare,
    markRead,
    markAllRead,
    reset,
  };
});
