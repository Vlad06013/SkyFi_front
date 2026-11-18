import { computed, defineComponent, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import AppBar from '@/components/AppBar/AppBar.vue';
import { useFriendsStore } from '@/stores/friends';
import { useNotificationsStore } from '@/stores/notifications';

export default defineComponent({
  name: 'FriendsPage',
  components: { AppBar },
  setup() {
    const router = useRouter();
    const query = ref('');
    const focused = ref(false);
    const notifications = useNotificationsStore();
    const { request } = storeToRefs(notifications);
    const { accept, decline } = notifications;
    const friendsStore = useFriendsStore();
    const { outgoing } = storeToRefs(friendsStore);

    const filtered = computed(() => {
      const q = query.value.trim().toLowerCase();
      if (!q) return friendsStore.listening;
      return friendsStore.listening.filter(
        (friend) =>
          friend.name.toLowerCase().includes(q) || friend.email.toLowerCase().includes(q),
      );
    });

    function openFriend(id: number) {
      router.push(`/friends/${id}`);
    }

    return {
      query,
      focused,
      request,
      accept,
      decline,
      listening: friendsStore.listening,
      outgoing,
      filtered,
      openFriend,
      cancelOutgoing: friendsStore.cancelOutgoing,
    };
  },
});
