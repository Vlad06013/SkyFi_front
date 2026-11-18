import { defineComponent, onMounted, onBeforeUnmount, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useNotificationsStore } from '@/stores/notifications';
import { usePlayerStore } from '@/stores/player';

export default defineComponent({
  name: 'NotificationPanel',
  setup() {
    const notifications = useNotificationsStore();
    const { open, request, shares, unreadCount, hasUnread } = storeToRefs(notifications);
    const { accept, decline, markRead, markAllRead, close } = notifications;
    const { expanded } = storeToRefs(usePlayerStore());
    const route = useRoute();

    function onDocPointerDown(event: PointerEvent) {
      if (!open.value) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('.n-pop') || target?.closest('.n-bell')) return;
      close();
    }

    onMounted(() => {
      document.addEventListener('pointerdown', onDocPointerDown);
    });

    onBeforeUnmount(() => {
      document.removeEventListener('pointerdown', onDocPointerDown);
    });

    watch(() => route.fullPath, close);
    watch(expanded, (value) => {
      if (value) close();
    });

    return { open, request, shares, unreadCount, hasUnread, accept, decline, markRead, markAllRead };
  },
});
