import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SeekBar from '@/components/SeekBar/SeekBar.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { useLyrics } from '@/composables/useLyrics';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { useSnapshotLike } from '@/composables/useSnapshotLike';
import { coverVar, artistsLine, trackCover } from '@/lib/cover';
import { sortRowStyle, startListSort, type ListSortState } from '@/lib/list-sort';
import { entityFromSnapshot } from '@/lib/media-menu';
import { trackPointer } from '@/lib/pointer-drag';
import { formatTime } from '@/lib/time';
import { usePlayerStore } from '@/stores/player';
import type { AnySnapshot, QueueItem } from '@/types';

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
      queueLoaded,
    } = storeToRefs(player);
    const playing = computed(() => player.state.is_playing);
    /** Фон клип-режима — превью текущего видео; пока нет видео/превью — чёрный фон. */
    const clipPoster = computed(() =>
      current.value && current.value.type === 'video' ? (current.value.cover_url ?? '') : '',
    );
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
      ensureQueue,
      removeQueueItem,
      reorderQueue,
    } = player;

    /** Строки очереди для UI: элементы без снапшота не рисуем. */
    const queueRows = computed(() =>
      queue.value
        .map((item: QueueItem) => ({ item, snapshot: item.snapshot }))
        .filter((row): row is { item: QueueItem; snapshot: AnySnapshot } => row.snapshot !== null),
    );

    /** Форма строки по типу снапшота: видео — широкое 16:9-превью (96px), медиа — обложка. */
    function queueRowKind(snapshot: AnySnapshot): 'track' | 'video' | 'media' {
      if (snapshot.type === 'video') return 'video';
      if (snapshot.type === 'track') return 'track';
      return 'media';
    }

    function queueRowCover(snapshot: AnySnapshot): string {
      if (snapshot.type === 'track') return trackCover(snapshot);
      return snapshot.cover_url ?? '';
    }

    const layer = ref<Layer>('now');
    const {
      lines: lyricLines,
      loading: lyricLoading,
      error: lyricError,
      synced: lyricSynced,
      retry: retryLyrics,
    } = useLyrics(
      () => (current.value?.type === 'track' ? current.value : null),
      () => layer.value === 'lyrics',
    );
    const activeLyricLine = computed(() => {
      if (!lyricSynced.value || !lyricLines.value) return -1;
      const positionMs = state.value.position_seconds * 1000;
      let active = -1;
      for (let index = 0; index < lyricLines.value.length; index += 1) {
        const timeMs = lyricLines.value[index].time_ms;
        if (timeMs === null || timeMs > positionMs) break;
        active = index;
      }
      return active;
    });
    const lyrEl = ref<HTMLElement | null>(null);
    watch(activeLyricLine, (index) => {
      if (index < 0) return;
      const el = lyrEl.value?.children[index];
      if (el instanceof HTMLElement) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
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
      // Раскрытая очередь не даём плееру уйти в простой — сначала её закрыть.
      if (clipMode.value && expanded.value && !qualityOpen.value && layer.value !== 'queue') {
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

    watch([clipMode, expanded, qualityOpen, layer], wake);

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
      void ensureQueue();
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
          void reorderQueue(from, to);
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
      queueRows,
      queueLoaded,
      playing,
      repeatLabel,
      layer,
      lyricLines,
      lyricLoading,
      lyricError,
      lyricSynced,
      activeLyricLine,
      lyrEl,
      retryLyrics,
      playerDragging,
      queueDragging,
      playerDragY,
      queueDragY,
      sortDrag,
      rootEl,
      playerDragStyle,
      queueSheetStyle,
      topLabel,
      clipPoster,
      coverVar,
      artistsLine,
      trackCover,
      queueRowKind,
      queueRowCover,
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
      removeQueueItem,
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
