import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player';
import { clipBuffering, clipFrameReady, clipTapHandlers, setMiniClipHost } from '@/composables/useVideoPlayback';
import { useSnapshotLike } from '@/composables/useSnapshotLike';
import { trackPointer } from '@/lib/pointer-drag';
import { artistsLine, coverVar, trackCover } from '@/lib/cover';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import type { AnySnapshot } from '@/types';

const paneGap = 20;
const tapSlop = 8;
const swipeThreshold = 64;
const settleDebounceMs = 90;

export default defineComponent({
  name: 'MiniPlayer',
  components: { SourceBadge },
  setup() {
    const player = usePlayerStore();
    const { current, previewNext, previewPrevious, progress, progressSmooth, clipActive, clipPlaybackVideo, audioLoading } =
      storeToRefs(player);
    /** Превью клипа на треке: обложка видео-снапшота, пока нет кадра. */
    const clipCover = computed(() => clipPlaybackVideo.value?.cover_url ?? '');
    /** Фактическое воспроизведение (не мнение сервера) — для иконки плеера. */
    const playing = computed(() => player.isPlaying);
    const { togglePlay, openExpanded, skipRestartAfter } = player;
    const { liked, toggleLike } = useSnapshotLike(() => player.current);

    /** Хост клипа в центральной панели: сворачивание переносит видео сюда. */
    const clipHostEl = ref<HTMLElement | null>(null);
    watch(clipHostEl, (el) => setMiniClipHost(el));
    function onClipHost(el: unknown) {
      clipHostEl.value = el instanceof HTMLElement ? el : null;
    }
    const clipTaps = clipTapHandlers();
    /** Двойной тап по клипу в мини-плеере — полный экран. Одинарный разворачивает плеер. */
    function onClipDblTap() {
      clipTaps.dblclick();
    }

    const trackEl = ref<HTMLElement | null>(null);
    const dragging = ref(false);
    let startClientX = 0;
    let startScroll = 0;
    let lastDx = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

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

    function slotOffset(index: number) {
      const el = trackEl.value;
      if (!el) return 0;
      return index * (el.clientWidth + paneGap);
    }

    function centerInstant() {
      const el = trackEl.value;
      if (!el) return;
      el.scrollLeft = slotOffset(1);
    }

    /** Ширина вьюпорта появляется не в тот же кадр, что монтирование. Пока её нет — слева виден сосед, его кнопка не текущий трек. */
    function centerSoon() {
      nextTick(() => {
        requestAnimationFrame(() => {
          if (!trackEl.value?.clientWidth) {
            requestAnimationFrame(centerInstant);
            return;
          }
          centerInstant();
        });
      });
    }

    function paneIsCurrent(index: number) {
      const pane = panes.value[index];
      const now = current.value;
      if (!pane || !now) return false;
      return (
        pane.snapshot.type === now.type &&
        pane.snapshot.source_type === now.source_type &&
        pane.snapshot.source_id === now.source_id
      );
    }

    function scrollToSlot(index: number) {
      trackEl.value?.scrollTo({ left: slotOffset(index), behavior: 'smooth' });
    }

    function commitNext() {
      if (!previewNext.value) {
        scrollToSlot(1);
        return;
      }
      player.skipNext();
      centerInstant();
    }

    function commitPrev() {
      const restartOnly = player.positionSeconds > skipRestartAfter;
      if (!previewPrevious.value) {
        scrollToSlot(1);
        return;
      }
      player.skipPrevious();
      if (restartOnly) {
        scrollToSlot(1);
        return;
      }
      centerInstant();
    }

    function onSettled() {
      if (dragging.value) return;
      const el = trackEl.value;
      if (!el) return;
      const step = el.clientWidth + paneGap;
      if (!step) return;
      const index = Math.round(el.scrollLeft / step);
      if (index >= 2) commitNext();
      else if (index <= 0) commitPrev();
    }

    function onScroll() {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(onSettled, settleDebounceMs);
    }

    function onDragStart(event: PointerEvent) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      // Лайк и play — свои кнопки. Картинка клипа тоже разворачивает плеер,
      // а не ставит паузу: иначе тап по нижнему плееру в видео — ещё и тогл.
      if (event.target instanceof Element && event.target.closest('.icon-btn, .fab')) return;
      const el = trackEl.value;
      if (!el) return;
      startClientX = event.clientX;
      startScroll = el.scrollLeft;
      lastDx = 0;
      dragging.value = true;
      trackPointer(event, {
        move: (next) => {
          lastDx = next.clientX - startClientX;
          el.scrollLeft = startScroll - lastDx;
        },
        up: () => {
          dragging.value = false;
          if (Math.abs(lastDx) < tapSlop) {
            openExpanded();
            return;
          }
          if (lastDx <= -swipeThreshold) scrollToSlot(2);
          else if (lastDx >= swipeThreshold) scrollToSlot(0);
          else scrollToSlot(1);
        },
        cancel: () => {
          dragging.value = false;
          scrollToSlot(1);
        },
      });
    }

    function onResize() {
      if (!dragging.value) centerInstant();
    }

    let widthObserver: ResizeObserver | null = null;

    function onLike(index: number) {
      if (index === 1) toggleLike();
    }

    function onTogglePlay(index: number) {
      if (paneIsCurrent(index)) togglePlay();
    }

    watch(
      () =>
        current.value
          ? `${current.value.type}:${current.value.source_type}:${current.value.source_id}`
          : null,
      () => centerSoon(),
    );

    onMounted(() => {
      centerSoon();
      window.addEventListener('resize', onResize);
      const el = trackEl.value;
      if (el && typeof ResizeObserver !== 'undefined') {
        widthObserver = new ResizeObserver(() => {
          if (!dragging.value) centerInstant();
        });
        widthObserver.observe(el);
      }
    });

    onBeforeUnmount(() => {
      widthObserver?.disconnect();
      widthObserver = null;
      // Хост ещё в документе: уводим video до того, как Vue снимет узел и браузер поставит паузу.
      setMiniClipHost(null);
      if (settleTimer) clearTimeout(settleTimer);
      window.removeEventListener('resize', onResize);
    });

    return {
      current,
      liked,
      playing,
      panes,
      progress,
      progressSmooth,
      clipActive,
      clipCover,
      clipHostEl,
      clipBuffering,
      audioLoading,
      clipFrameReady,
      onClipHost,
      onClipDblTap,
      trackEl,
      coverVar,
      trackCover,
      onDragStart,
      onScroll,
      onLike,
      onTogglePlay,
      paneIsCurrent,
    };
  },
});
