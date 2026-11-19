import { computed, defineComponent, onBeforeUnmount, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player';
import { useSnapshotLike } from '@/composables/useSnapshotLike';
import { trackPointer } from '@/lib/pointer-drag';
import { artistsLine, coverVar } from '@/lib/cover';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import type { AnySnapshot } from '@/types';

const tapSlop = 8;
const swipeThreshold = 64;
const commitMs = 180;

export default defineComponent({
  name: 'MiniPlayer',
  components: { SourceBadge },
  setup() {
    const player = usePlayerStore();
    const { current, previewNext, previewPrevious } = storeToRefs(player);
    const playing = computed(() => player.state.is_playing);
    const { togglePlay, openExpanded } = player;
    const { liked, toggleLike } = useSnapshotLike(() => player.current);

    const rootEl = ref<HTMLElement | null>(null);
    const dragX = ref(0);
    const dragging = ref(false);
    const noJump = ref(false);
    const commitDir = ref(0);
    let skipTimer: ReturnType<typeof setTimeout> | null = null;

    const panes = computed(() => {
      const now = current.value;
      if (!now) return [];
      const toPane = (snapshot: AnySnapshot) => ({
        snapshot,
        title: snapshot.title,
        artist: `${artistsLine(snapshot.artists)}${snapshot.type === 'video' ? ' · клип' : ''}`,
      });
      return [
        toPane(previewPrevious.value ?? now),
        toPane(now),
        toPane(previewNext.value ?? now),
      ];
    });

    const sliderStyle = computed(() => ({
      transform: `translateX(calc(-100% / 3 + ${dragX.value}px))`,
      transition: dragging.value || noJump.value
        ? 'none'
        : commitDir.value
          ? `transform ${commitMs}ms ease`
          : 'transform .2s ease',
    }));

    function instantReset() {
      noJump.value = true;
      dragX.value = 0;
      commitDir.value = 0;
      requestAnimationFrame(() => {
        noJump.value = false;
      });
    }

    function onDragStart(event: PointerEvent) {
      if (commitDir.value) return;
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
          const width = rootEl.value?.offsetWidth ?? 0;
          dragging.value = false;
          if (Math.abs(dx) < tapSlop) {
            dragX.value = 0;
            openExpanded();
            return;
          }
          if (Math.abs(dx) >= swipeThreshold && width) {
            const dir = dx < 0 ? 1 : -1;
            commitDir.value = dir;
            dragX.value = -dir * width;
            skipTimer = setTimeout(() => {
              if (dir > 0) player.skipNext();
              else player.skipPrevious();
              instantReset();
            }, commitMs);
            return;
          }
          dragX.value = 0;
        },
      });
    }

    function onLike(index: number) {
      if (index === 1) toggleLike();
    }

    function onTogglePlay(index: number) {
      if (index === 1) togglePlay();
    }

    onBeforeUnmount(() => {
      if (skipTimer) clearTimeout(skipTimer);
    });

    return {
      current,
      liked,
      playing,
      panes,
      rootEl,
      sliderStyle,
      coverVar,
      onDragStart,
      onLike,
      onTogglePlay,
    };
  },
});
