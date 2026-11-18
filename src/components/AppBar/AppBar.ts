import { defineComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useNotificationsStore } from '@/stores/notifications';

export default defineComponent({
  name: 'AppBar',
  props: {
    title: { type: String, default: '' },
    back: { type: Boolean, default: false },
    badge: { type: Boolean, default: false },
  },
  setup() {
    const notifications = useNotificationsStore();
    const { hasUnread } = storeToRefs(notifications);
    const { toggle } = notifications;
    const router = useRouter();

    function goBack() {
      router.back();
    }

    return { hasUnread, toggle, goBack };
  },
});
