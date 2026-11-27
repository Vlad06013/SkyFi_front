import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { ApiError, isOfflineError } from '@/api/http';
import {
  acceptFriendRequest,
  fetchFriendshipOverview,
  removeFriend as removeFriendApi,
  sendFriendRequest,
} from '@/api/friends';
import { liveLine } from '@/lib/friends';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
import type { FriendshipOverviewPayload, FriendshipPayload, FriendshipSide } from '@/types';

/** Друг для UI: сторона дружбы, которая не я. Дружба адресуется по id пользователя. */
export interface FriendEntry {
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
    user,
    live: liveLine(user.current_snapshot),
    watching: user.current_snapshot?.type === 'video',
  };
}

/** Тост ошибки; офлайн-ошибки молчат (optimizations.md «Офлайн-гейт»). */
function toastError(cause: unknown, fallback: string) {
  if (isOfflineError(cause)) return;
  // 422 без общего сообщения: показываем первую ошибку поля («Вы уже
  // друзья.»), а не служебное «Проверьте поля формы.».
  const fieldMessage = cause instanceof ApiError ? Object.values(cause.fields ?? {})[0]?.[0] : undefined;
  useToastStore().show(fieldMessage ?? (cause instanceof Error ? cause.message : fallback), '', true);
}

/** Друзья по API (api.md §12). Секции одним обзорным GET; мутации дёргают
 * эндпоинты и правят списки локально (сервер — источник истины для загрузки). */
export const useFriendsStore = defineStore('friends', () => {
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

  /** Принять входящую заявку (адресуется по id отправителя). */
  async function accept(userId: number) {
    try {
      const friendship = await acceptFriendRequest(userId);
      incoming.value = incoming.value.filter((entry) => entry.user.id !== userId);
      friends.value = [toEntry(friendship, auth.user?.id), ...friends.value];
    } catch (cause) {
      toastError(cause, 'Не удалось принять заявку');
    }
  }

  /** Отклонить входящую заявку. */
  async function decline(userId: number) {
    try {
      await removeFriendApi(userId);
      incoming.value = incoming.value.filter((entry) => entry.user.id !== userId);
    } catch (cause) {
      toastError(cause, 'Не удалось отклонить заявку');
    }
  }

  /** Удалить из друзей. true — удалено. */
  async function removeFriend(userId: number): Promise<boolean> {
    try {
      await removeFriendApi(userId);
      friends.value = friends.value.filter((entry) => entry.user.id !== userId);
      return true;
    } catch (cause) {
      toastError(cause, 'Не удалось удалить друга');
      return false;
    }
  }

  /** Отменить исходящую заявку. */
  async function cancelOutgoing(userId: number) {
    try {
      await removeFriendApi(userId);
      outgoing.value = outgoing.value.filter((entry) => entry.user.id !== userId);
    } catch (cause) {
      toastError(cause, 'Не удалось отменить заявку');
    }
  }

  /** Отправка заявки. true — отправлено. */
  async function sendRequest(userId: number): Promise<boolean> {
    try {
      const friendship = await sendFriendRequest(userId);
      outgoing.value = [toEntry(friendship, auth.user?.id), ...outgoing.value];
      return true;
    } catch (cause) {
      toastError(cause, 'Не удалось отправить заявку');
      return false;
    }
  }

  /** Сокет friendship.request.sent: заявка мне — в incoming. Списки не загружены — пропускаем (ensure подтянет свежие). */
  function applyRequestSent(friendship: FriendshipPayload) {
    if (!loaded.value) return;
    const entry = toEntry(friendship, auth.user?.id);
    if (!incoming.value.some((item) => item.user.id === entry.user.id)) {
      incoming.value = [entry, ...incoming.value];
    }
  }

  /** Сокет friendship.request.accepted: мою заявку приняли — outgoing → friends. */
  function applyRequestAccepted(friendship: FriendshipPayload) {
    if (!loaded.value) return;
    const entry = toEntry(friendship, auth.user?.id);
    outgoing.value = outgoing.value.filter((item) => item.user.id !== entry.user.id);
    if (!friends.value.some((item) => item.user.id === entry.user.id)) {
      friends.value = [entry, ...friends.value];
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
    cancelOutgoing,
    sendRequest,
    applyRequestSent,
    applyRequestAccepted,
  };
});
