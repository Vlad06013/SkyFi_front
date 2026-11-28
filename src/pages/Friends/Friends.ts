import { computed, defineComponent, ref, watch } from 'vue';
import { usePageRefresh } from '@/composables/usePageRefresh';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import AppBar from '@/components/AppBar/AppBar.vue';
import { searchUsers } from '@/api/friends';
import { friendInitial, friendTone } from '@/lib/friends';
import { resolveUrl } from '@/lib/endpoints';
import { useFriendsStore } from '@/stores/friends';
import type { UserSearchItem } from '@/types';

const SEARCH_DEBOUNCE_MS = 350;

type FoundKind = 'friends' | 'incoming' | 'outgoing' | 'none';

/**
 * Сырой статус search-users → нормализованный вид. Бэк шлёт enum БД
 * в верхнем регистре (PENDING/ACCEPTED — проверено curl'ом 2026-11-27),
 * направление заявки статус не кодирует: PENDING одинаков у обеих сторон.
 */
function baseKind(item: UserSearchItem): FoundKind | 'pending' {
  const status = item.friendship_status?.toLowerCase() ?? '';
  if (status === 'friends' || status === 'accepted') return 'friends';
  if (status === 'incoming') return 'incoming';
  if (status === 'outgoing') return 'outgoing';
  if (status === 'pending') return 'pending';
  return 'none';
}

export default defineComponent({
  name: 'FriendsPage',
  components: { AppBar },
  setup() {
    const router = useRouter();
    const query = ref('');
    const focused = ref(false);
    const friendsStore = useFriendsStore();
    const { friends, incoming, outgoing, loaded } = storeToRefs(friendsStore);

    const foundUsers = ref<UserSearchItem[]>([]);
    const searchingUsers = ref(false);
    /** Какой обзор был актуален, когда пришла выдача. */
    const foundTick = ref(0);
    let generation = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Вид строки выдачи. Выдача — снапшот на момент поиска. Сокеты есть
     * только на sent/accepted (api.md §17): отмена и отклонение списки
     * сами не двигают, их привозит обзор. Живой стор важнее снимка.
     * Если обзор свежее выдачи и человека нет ни в одной секции — связи
     * больше нет, старый PENDING не оставляем «заявка отправлена».
     * Пока выдача новее обзора (или обзор ещё не грузили), PENDING
     * показываем как исходящую: «Добавить» на живую заявку даёт 422.
     */
    function statusKind(item: UserSearchItem): FoundKind {
      if (friendsStore.friends.some((entry) => entry.user.id === item.user_id)) return 'friends';
      if (friendsStore.incoming.some((entry) => entry.user.id === item.user_id)) return 'incoming';
      if (friendsStore.outgoing.some((entry) => entry.user.id === item.user_id)) return 'outgoing';
      if (friendsStore.loaded && foundTick.value < friendsStore.overviewTick) return 'none';
      const kind = baseKind(item);
      if (kind !== 'pending') return kind;
      return 'outgoing';
    }

    function searchNow(q: string) {
      const gen = ++generation;
      const tick = friendsStore.overviewTick;
      searchingUsers.value = true;
      searchUsers(q)
        .then((items) => {
          if (gen !== generation) return;
          foundUsers.value = items;
          foundTick.value = tick;
        })
        .catch(() => undefined)
        .finally(() => {
          if (gen === generation) searchingUsers.value = false;
        });
    }

    watch(query, () => {
      const q = query.value.trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (!q) {
        foundUsers.value = [];
        return;
      }
      debounceTimer = setTimeout(() => searchNow(q), SEARCH_DEBOUNCE_MS);
    });

    usePageRefresh(async () => {
      await friendsStore.fetchAll();
      const q = query.value.trim();
      if (!q) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      searchNow(q);
    });

    /** Заявки из выдачи (отправленные и полученные) — сверху, отдельно от общего списка. */
    const requestUsers = computed(() =>
      foundUsers.value.filter((item) => {
        const kind = statusKind(item);
        return kind === 'incoming' || kind === 'outgoing';
      }),
    );

    const restUsers = computed(() =>
      foundUsers.value.filter((item) => statusKind(item) !== 'incoming' && statusKind(item) !== 'outgoing'),
    );

    function patchFound(userId: number, patch: Partial<UserSearchItem>) {
      foundUsers.value = foundUsers.value.map((item) =>
        item.user_id === userId ? { ...item, ...patch } : item,
      );
    }

    function openFriend(id: number) {
      router.push(`/friends/${id}`);
    }

    async function addUser(user: UserSearchItem) {
      const sent = await friendsStore.sendRequest(user.user_id);
      if (sent) {
        patchFound(user.user_id, { friendship_status: 'outgoing' });
      }
    }

    async function cancelRequest(user: UserSearchItem) {
      await friendsStore.cancelOutgoing(user.user_id);
      patchFound(user.user_id, { friendship_status: 'none' });
    }

    async function acceptRequest(user: UserSearchItem) {
      await friendsStore.accept(user.user_id);
      patchFound(user.user_id, { friendship_status: 'friends' });
    }

    async function declineRequest(user: UserSearchItem) {
      await friendsStore.decline(user.user_id);
      patchFound(user.user_id, { friendship_status: 'none' });
    }

    return {
      query,
      focused,
      loaded,
      incoming,
      friends,
      outgoing,
      foundUsers,
      searchingUsers,
      requestUsers,
      restUsers,
      statusKind,
      friendInitial,
      friendTone,
      resolveUrl,
      openFriend,
      addUser,
      cancelRequest,
      acceptRequest,
      declineRequest,
      accept: friendsStore.accept,
      decline: friendsStore.decline,
      cancelOutgoing: friendsStore.cancelOutgoing,
    };
  },
});
