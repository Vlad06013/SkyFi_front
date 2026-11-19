import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SeekBar from '@/components/SeekBar/SeekBar.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { useSnapshotLike } from '@/composables/useSnapshotLike';
import { coverVar, artistsLine } from '@/lib/cover';
import { moveItem, sortRowStyle, startListSort, type ListSortState } from '@/lib/list-sort';
import { entityFromSnapshot } from '@/lib/media-menu';
import { trackPointer } from '@/lib/pointer-drag';
import { formatTime } from '@/lib/time';
import { usePlayerStore } from '@/stores/player';
import clipFrame from '../../../design/shared/clip-frame.jpg';

type Layer = 'now' | 'queue' | 'lyrics';

export default defineComponent({
  name: 'NowPlaying',
  components: { MediaOverlays, SeekBar, SnapshotRow, SourceBadge },
  setup() {
    const player = usePlayerStore();
    const {
      expanded,
      current,
      title,
      artist,
      album,
      progress,
      durationSeconds,
      state,
      clipMode,
      clipQuality,
      queue,
    } = storeToRefs(player);
    const playing = computed(() => player.state.is_playing);
    const { liked, toggleLike } = useSnapshotLike(() => player.current);
    const repeatLabel = computed(() => {
      if (state.value.repeat_mode === 'one') return 'повтор одного';
      if (state.value.repeat_mode === 'all') return 'повтор всех';
      return 'повтор выкл';
    });
    const {
      closeExpanded,
      togglePlay,
      toggleShuffle,
      toggleRepeat,
      skipNext,
      skipPrevious,
      playSnapshot,
      seekRatio,
      toggleClips,
      setClipQuality,
    } = player;

    const layer = ref<Layer>('now');
    const playerDragging = ref(false);
    const queueDragging = ref(false);
    const playerDragY = ref(0);
    const queueDragY = ref(0);
    const swipeThreshold = 88;
    const sortDrag = ref<ListSortState | null>(null);
    const rootEl = ref<HTMLElement | null>(null);
    const qualityOpen = ref(false);
    const clipIdle = ref(false);
    const isFullscreen = ref(false);
    const clipIdleDelay = 5000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const clipQualities = player.clipQualities;

    function wake() {
      clipIdle.value = false;
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (clipMode.value && expanded.value && !qualityOpen.value) {
        idleTimer = setTimeout(() => {
          clipIdle.value = true;
        }, clipIdleDelay);
      }
    }

    function pickQuality(quality: number) {
      setClipQuality(quality);
      qualityOpen.value = false;
    }

    function onFullscreenChange() {
      isFullscreen.value = document.fullscreenElement === rootEl.value;
    }

    function toggleFullscreen() {
      if (!rootEl.value) return;
      if (document.fullscreenElement) {
        void document.exitFullscreen();
        return;
      }
      void rootEl.value.requestFullscreen();
    }

    watch([clipMode, expanded, qualityOpen], wake);

    onMounted(() => {
      wake();
      document.addEventListener('fullscreenchange', onFullscreenChange);
    });

    onBeforeUnmount(() => {
      if (idleTimer) clearTimeout(idleTimer);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    });

    const { open, items, top, right, sheet, entity, openMenu, closeMenu, run } = useMediaMenu({
      onLyrics() {
        closeMenu();
        sheet.value = null;
        layer.value = layer.value === 'lyrics' ? 'now' : 'lyrics';
      },
    });

    const topLabel = computed(() => {
      if (sheet.value || layer.value !== 'now') return 'назад';
      return 'свернуть';
    });

    const playerDragStyle = computed(() => {
      if (!playerDragY.value) return undefined;
      return {
        transform: `translateY(${playerDragY.value}px)`,
        opacity: String(Math.max(0.45, 1 - playerDragY.value / 520)),
      };
    });

    const queueSheetStyle = computed(() => {
      if (!queueDragY.value) return undefined;
      return { transform: `translateY(${queueDragY.value}px)` };
    });

    function collapse() {
      closeMenu();
      sheet.value = null;
      layer.value = 'now';
      playerDragging.value = false;
      queueDragging.value = false;
      playerDragY.value = 0;
      queueDragY.value = 0;
      closeExpanded();
    }

    function closeQueue() {
      layer.value = 'now';
      queueDragging.value = false;
      queueDragY.value = 0;
    }

    function onTop() {
      if (sheet.value === 'friend-share') {
        sheet.value = 'share';
        return;
      }
      if (sheet.value) {
        sheet.value = null;
        return;
      }
      if (layer.value !== 'now') {
        layer.value = 'now';
        return;
      }
      collapse();
    }

    function openQueue() {
      closeMenu();
      sheet.value = null;
      layer.value = layer.value === 'queue' ? 'now' : 'queue';
    }

    function onClips() {
      closeMenu();
      toggleClips();
    }

    function openNowMenu(event: MouseEvent) {
      if (!current.value) return;
      if (open.value) {
        closeMenu();
        return;
      }
      const context = current.value.type === 'video' ? 'now-video' : 'now-track';
      openMenu(event, context, entityFromSnapshot(current.value, artist.value));
    }

    function isNoDragTarget(target: EventTarget | null) {
      return target instanceof Element && Boolean(
        target.closest('button, a, input, .ctx, .seek, .seek-bar, .p-sheet-head, .p-sheet-body, .sheet-mask, .sky-toast, .clip-quality, .clip-quality-mask'),
      );
    }

    function onPlayerDragStart(event: PointerEvent) {
      wake();
      if (sheet.value) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (isNoDragTarget(event.target)) return;
      if (open.value) closeMenu();
      const startX = event.clientX;
      const startY = event.clientY;
      playerDragging.value = true;
      playerDragY.value = 0;
      trackPointer(event, {
        move: (next) => {
          const dy = next.clientY - startY;
          const dx = next.clientX - startX;
          playerDragY.value = dy > 0 && Math.abs(dy) >= Math.abs(dx) ? dy : 0;
        },
        up: () => {
          const shouldClose = playerDragY.value > swipeThreshold;
          playerDragging.value = false;
          if (shouldClose) {
            collapse();
            return;
          }
          playerDragY.value = 0;
        },
      });
    }

    function onSortStart(event: PointerEvent, index: number) {
      const container = (event.currentTarget as HTMLElement).closest('.p-sheet-body');
      if (!(container instanceof HTMLElement)) return;
      startListSort(event, index, {
        container,
        onMove: (next) => {
          sortDrag.value = next;
        },
        onEnd: (from, to) => {
          sortDrag.value = null;
          queue.value = moveItem(queue.value, from, to);
        },
      });
    }

    function onQueueDragStart(event: PointerEvent) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.stopPropagation();
      const startY = event.clientY;
      queueDragging.value = true;
      queueDragY.value = 0;
      trackPointer(event, {
        move: (next) => {
          queueDragY.value = Math.max(0, next.clientY - startY);
        },
        up: () => {
          const shouldClose = queueDragY.value > swipeThreshold;
          queueDragging.value = false;
          if (shouldClose) {
            closeQueue();
            return;
          }
          queueDragY.value = 0;
        },
      });
    }

    return {
      expanded,
      current,
      title,
      artist,
      album,
      progress,
      durationSeconds,
      liked,
      state,
      clipMode,
      clipQuality,
      clipQualities,
      qualityOpen,
      clipIdle,
      isFullscreen,
      queue,
      playing,
      repeatLabel,
      layer,
      playerDragging,
      queueDragging,
      playerDragY,
      queueDragY,
      sortDrag,
      rootEl,
      playerDragStyle,
      queueSheetStyle,
      topLabel,
      clipFrame,
      coverVar,
      artistsLine,
      sortRowStyle,
      formatTime,
      togglePlay,
      toggleLike,
      toggleShuffle,
      toggleRepeat,
      skipNext,
      skipPrevious,
      playSnapshot,
      seekRatio,
      toggleClips,
      pickQuality,
      toggleFullscreen,
      onTop,
      openQueue,
      onClips,
      openNowMenu,
      onPlayerDragStart,
      onSortStart,
      onQueueDragStart,
      open,
      items,
      top,
      right,
      sheet,
      entity,
      closeMenu,
      run,
    };
  },
});
