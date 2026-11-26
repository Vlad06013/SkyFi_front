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

/** Статус заявки из search-users в нормализованный вид (допустимые строки бэком не зафиксированы). */
function statusKind(item: UserSearchItem): 'friends' | 'incoming' | 'outgoing' | 'none' {
  if (item.friendship_status === 'friends') return 'friends';
  if (item.friendship_status === 'incoming') return 'incoming';
  if (item.friendship_status === 'outgoing' || item.friendship_status === 'pending') return 'outgoing';
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
    usePageRefresh(() => friendsStore.fetchAll());
    const { friends, incoming, outgoing, loaded } = storeToRefs(friendsStore);

    const foundUsers = ref<UserSearchItem[]>([]);
    const searchingUsers = ref(false);
    let generation = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    watch(query, () => {
      const q = query.value.trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (!q) {
        foundUsers.value = [];
        return;
      }
      debounceTimer = setTimeout(() => {
        const gen = ++generation;
        searchingUsers.value = true;
        searchUsers(q)
          .then((items) => {
            if (gen === generation) foundUsers.value = items;
          })
          .catch(() => undefined)
          .finally(() => {
            if (gen === generation) searchingUsers.value = false;
          });
      }, SEARCH_DEBOUNCE_MS);
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
