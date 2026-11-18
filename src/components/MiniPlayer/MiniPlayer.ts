import { computed, defineComponent, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player';
import { useSnapshotLike } from '@/composables/useSnapshotLike';
import { trackPointer } from '@/lib/pointer-drag';
import { coverVar } from '@/lib/cover';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';

const tapSlop = 8;
const swipeThreshold = 64;

export default defineComponent({
  name: 'MiniPlayer',
  components: { SourceBadge },
  setup() {
    const player = usePlayerStore();
    const { current, title, artist } = storeToRefs(player);
    const playing = computed(() => player.state.is_playing);
    const { togglePlay, openExpanded } = player;
    const { liked, toggleLike } = useSnapshotLike(() => player.current);

    const dragX = ref(0);
    const dragging = ref(false);

    const dragStyle = computed(() => {
      if (!dragging.value && !dragX.value) return undefined;
      return {
        transform: `translateX(${dragX.value}px)`,
        transition: dragging.value ? 'none' : 'transform .2s ease',
      };
    });

    function onDragStart(event: PointerEvent) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('.icon-btn, .fab')) return;
      const startX = event.clientX;
      dragging.value = true;
      trackPointer(event, {
        move: (next) => {
          dragX.value = next.clientX - startX;
        },
        up: () => {
          const dx = dragX.value;
          dragging.value = false;
          dragX.value = 0;
          if (Math.abs(dx) < tapSlop) {
            openExpanded();
            return;
          }
          if (Math.abs(dx) >= swipeThreshold) {
            if (dx < 0) player.skipNext();
            else player.skipPrevious();
          }
        },
      });
    }

    return {
      current,
      title,
      artist,
      liked,
      playing,
      dragStyle,
      onDragStart,
      togglePlay,
      toggleLike,
      coverVar,
    };
  },
});
