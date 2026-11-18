import { defineComponent, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import AppBar from '@/components/AppBar/AppBar.vue';
import { mockFriends } from '@/mocks/friends';
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

    const filtered = () => {
      const q = query.value.trim().toLowerCase();
      if (!q) return mockFriends;
      return mockFriends.filter(
        (f) => f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q),
      );
    };

    function openFriend(id: number) {
      router.push(`/friends/${id}`);
    }

    return {
      query,
      focused,
      request,
      accept,
      decline,
      mockFriends,
      filtered,
      openFriend,
    };
  },
});
