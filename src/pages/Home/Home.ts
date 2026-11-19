import { computed, defineComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player';
import { useNotificationsStore } from '@/stores/notifications';
import { useSnapshotLike } from '@/composables/useSnapshotLike';
import { coverVar, trackCover } from '@/lib/cover';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import OfflineBanner from '@/components/OfflineBanner/OfflineBanner.vue';

export default defineComponent({
  name: 'HomePage',
  components: { SourceBadge, OfflineBanner },
  setup() {
    const player = usePlayerStore();
    const { current, title, artist } = storeToRefs(player);
    const playing = computed(() => player.state.is_playing);
    const { togglePlay, openExpanded, skipNext, skipPrevious } = player;
    const { liked, toggleLike } = useSnapshotLike(() => player.current);

    const notifications = useNotificationsStore();
    const { hasUnread } = storeToRefs(notifications);
    const { toggle: toggleBell } = notifications;

    return {
      current,
      title,
      artist,
      liked,
      playing,
      togglePlay,
      toggleLike,
      openExpanded,
      skipNext,
      skipPrevious,
      hasUnread,
      toggleBell,
      coverVar,
      trackCover,
    };
  },
});
