import { computed, defineComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player';
import { useNotificationsStore } from '@/stores/notifications';
import { coverVar } from '@/lib/cover';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';

export default defineComponent({
  name: 'HomePage',
  components: { SourceBadge },
  setup() {
    const player = usePlayerStore();
    const { current, title, artist, liked } = storeToRefs(player);
    const playing = computed(() => player.state.is_playing);
    const { togglePlay, toggleLike, openExpanded, skipNext, skipPrevious } = player;

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
    };
  },
});
