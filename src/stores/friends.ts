import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import {
  acceptFriendship,
  deleteFriendship,
  fetchFriendshipOverview,
  sendFriendRequest,
} from '@/api/friends';
import { liveLine } from '@/lib/friends';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
import type { FriendshipOverviewPayload, FriendshipPayload, FriendshipSide } from '@/types';

/** Друг для UI: дружба + сторона, которая не я. */
export interface FriendEntry {
  friendshipId: number;
  user: FriendshipSide;
  /** «Сейчас играет» строкой для списка (null — плеер пуст). */
  live: string | null;
  /** Смотрит видео (превью в списке). */
  watching: boolean;
}

function toEntry(friendship: FriendshipPayload, myId: number | undefined): FriendEntry {
  const user =
    myId !== undefined && friendship.sender.id === myId ? friendship.receiver : friendship.sender;
  return {
    friendshipId: friendship.id,
    user,
    live: liveLine(user.current_snapshot),
    watching: user.current_snapshot?.type === 'video',
  };
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

/** Друзья по API (api.md §12). Секции одним обзорным GET; мутации дёргают
 * эндпоинты и правят списки локально (сервер — источник истины для загрузки). */
export const useFriendsStore = defineStore('friends', () => {
  const toast = useToastStore();
  const auth = useAuthStore();

  const friends = ref<FriendEntry[]>([]);
  const incoming = ref<FriendEntry[]>([]);
  const outgoing = ref<FriendEntry[]>([]);
  const loaded = ref(false);

  function applyOverview(payload: FriendshipOverviewPayload) {
    const id = auth.user?.id;
    friends.value = payload.friends.map((item) => toEntry(item, id));
    incoming.value = payload.incoming.map((item) => toEntry(item, id));
    outgoing.value = payload.outgoing.map((item) => toEntry(item, id));
    loaded.value = true;
  }

  /** Первичная загрузка; неудача не поднимается — флажок не ставим, можно повторить. */
  async function fetchAll() {
    applyOverview(await fetchFriendshipOverview());
  }

  function ensure(): Promise<void> {
    if (loaded.value) return Promise.resolve();
    return fetchAll().catch(() => undefined);
  }

  async function accept(friendshipId: number) {
    try {
      const friendship = await acceptFriendship(friendshipId);
      incoming.value = incoming.value.filter((item) => item.friendshipId !== friendshipId);
      friends.value = [toEntry(friendship, auth.user?.id), ...friends.value];
    } catch (cause) {
      toast.show(errorMessage(cause, 'Не удалось принять заявку'), '', true);
    }
  }

  async function decline(friendshipId: number) {
    try {
      await deleteFriendship(friendshipId);
      incoming.value = incoming.value.filter((item) => item.friendshipId !== friendshipId);
    } catch (cause) {
      toast.show(errorMessage(cause, 'Не удалось отклонить заявку'), '', true);
    }
  }

  /** Удаление дружбы по id дружбы. true — удалено. */
  async function removeFriend(friendshipId: number): Promise<boolean> {
    try {
      await deleteFriendship(friendshipId);
      friends.value = friends.value.filter((item) => item.friendshipId !== friendshipId);
      return true;
    } catch (cause) {
      toast.show(errorMessage(cause, 'Не удалось удалить друга'), '', true);
      return false;
    }
  }

  /** Удаление дружбы по id пользователя (страница друга знает user id,
   * DELETE ждёт friendship id — находим по обзору, подгружая его при необходимости). */
  async function removeByUserId(userId: number): Promise<boolean> {
    if (!loaded.value) await ensure();
    const entry = friends.value.find((item) => item.user.id === userId);
    if (!entry) return false;
    return removeFriend(entry.friendshipId);
  }

  async function cancelOutgoing(friendshipId: number) {
    try {
      await deleteFriendship(friendshipId);
      outgoing.value = outgoing.value.filter((item) => item.friendshipId !== friendshipId);
    } catch (cause) {
      toast.show(errorMessage(cause, 'Не удалось отменить заявку'), '', true);
    }
  }

  /** Отправка заявки. Успех — id созданной дружбы (нужен для «Отменить»), иначе null. */
  async function sendRequest(userId: number): Promise<number | null> {
    try {
      const friendship = await sendFriendRequest(userId);
      outgoing.value = [toEntry(friendship, auth.user?.id), ...outgoing.value];
      return friendship.id;
    } catch (cause) {
      toast.show(errorMessage(cause, 'Не удалось отправить заявку'), '', true);
      return null;
    }
  }

  function clearAll() {
    friends.value = [];
    incoming.value = [];
    outgoing.value = [];
    loaded.value = false;
  }

  // Автозагрузка как у избранного: вход + возврат онлайна; выход чистит списки.
  watch(
    () => [auth.isAuthed, useOnlineStore().isOnline] as const,
    ([authed, online]) => {
      if (authed && online && !loaded.value) void fetchAll().catch(() => undefined);
      if (!authed && loaded.value) clearAll();
    },
    { immediate: true },
  );

  return {
    friends,
    incoming,
    outgoing,
    loaded,
    ensure,
    fetchAll,
    accept,
    decline,
    removeFriend,
    removeByUserId,
    cancelOutgoing,
    sendRequest,
  };
});
