import { computed, defineComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player';
import { coverVar } from '@/lib/cover';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';

export default defineComponent({
  name: 'MiniPlayer',
  components: { SourceBadge },
  setup() {
    const player = usePlayerStore();
    const { current, title, artist, liked } = storeToRefs(player);
    const playing = computed(() => player.state.is_playing);
    const { togglePlay, toggleLike, openExpanded } = player;

    return {
      current,
      title,
      artist,
      liked,
      playing,
      togglePlay,
      toggleLike,
      openExpanded,
      coverVar,
    };
  },
});
