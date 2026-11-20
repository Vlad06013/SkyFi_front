import { defineComponent, onMounted, onBeforeUnmount, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { friendInitial, friendTone } from '@/lib/friends';
import { openSnapshot } from '@/lib/open-snapshot';
import { useFriendsStore } from '@/stores/friends';
import { useNotificationsStore, type ShareNotice } from '@/stores/notifications';
import { usePlayerStore } from '@/stores/player';
import type { AnySnapshot } from '@/types';

const typeLabels: Record<AnySnapshot['type'], string> = {
  track: 'трек',
  video: 'видео',
  album: 'альбом',
  playlist: 'плейлист',
  artist: 'артист',
};

export default defineComponent({
  name: 'NotificationPanel',
  setup() {
    const notifications = useNotificationsStore();
    const friends = useFriendsStore();
    const { open, requests, shares, unreadCount, hasUnread } = storeToRefs(notifications);
    const { markRead, markAllRead, close, ensure } = notifications;
    const { expanded } = storeToRefs(usePlayerStore());
    const route = useRoute();
    const router = useRouter();

    // Открыли панель — догружаем шары (лениво, при первом разе).
    watch(open, (value) => {
      if (value) ensure();
    });

    /** Клик по шаре: как обычный клик по снапшоту (плеер/деталка) + гасим непрочитанность. */
    function openShare(share: ShareNotice) {
      markRead(share.id);
      openSnapshot(router, share.snapshot);
      close();
    }

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

    return {
      open,
      requests,
      shares,
      unreadCount,
      hasUnread,
      markAllRead,
      openShare,
      accept: friends.accept,
      decline: friends.decline,
      friendInitial,
      friendTone,
      typeLabel: (snapshot: AnySnapshot) => typeLabels[snapshot.type] ?? snapshot.type,
    };
  },
});
