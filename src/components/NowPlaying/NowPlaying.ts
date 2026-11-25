import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SeekBar from '@/components/SeekBar/SeekBar.vue';
import type { BufferedRange } from '@/components/SeekBar/SeekBar';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { getAudioElement } from '@/composables/useAudioPlayback';
import { useLyrics } from '@/composables/useLyrics';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { clipBuffering, clipFrameReady, clipTapHandlers, getClipVideoElement, setClipHost } from '@/composables/useVideoPlayback';
import { useSnapshotLike } from '@/composables/useSnapshotLike';
import { coverVar, artistsLine, trackCover } from '@/lib/cover';
import { sortRowStyle, startListSort, type ListSortState } from '@/lib/list-sort';
import { entityFromSnapshot } from '@/lib/media-menu';
import { PLAY_SOURCE_QUEUE } from '@/lib/play-sources';
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
      positionSeconds,
      state,
      clipMode,
      clipActive,
      clipPlaybackVideo,
      audioLoading,
      clipQuality,
      clipQualities,
      clipStreams,
      clipHlsHeights,
      clipHlsAuto,
      clipAudioId,
      clipAudioTracks,
      queue,
      queueLoaded,
    } = storeToRefs(player);
    /** Фактическое воспроизведение (не мнение сервера) — для иконки и эквалайзера. */
    const playing = computed(() => player.isPlaying);
    /** Фон клип-режима — обложка видео-снапшота. У трека это резолвнутый клип, не обложка аудио. */
    const clipPoster = computed(() => {
      const videoCover = clipPlaybackVideo.value?.cover_url;
      if (videoCover) return videoCover;
      const snap = current.value;
      if (!snap) return '';
      if (snap.type === 'track') return trackCover(snap);
      return snap.cover_url ?? '';
    });
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
      seekRatio,
      toggleClips,
      setClipQuality,
      setClipQualityAuto,
      setClipAudioId,
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

    /** Тап по элементу очереди: текущий — пауза/плей, иной прямой запуск
     *  с source=queue — бэк сам двигает статусы (pending → playing_now,
     *  прежний — played). */
    function playFromQueue(snapshot: AnySnapshot) {
      void player.playOrToggle(snapshot, PLAY_SOURCE_QUEUE);
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
      const positionMs = positionSeconds.value * 1000;
      let active = -1;
      for (let index = 0; index < lyricLines.value.length; index += 1) {
        const timeMs = lyricLines.value[index].time_ms;
        if (timeMs === null || timeMs > positionMs) break;
        active = index;
      }
      return active;
    });
    const lyrEl = ref<HTMLElement | null>(null);
    /** Первая активация после загрузки строк пропускается: текст открываем
     *  с начала, а не с активной строки (позиция может быть любой).
     *  Дальше слой следит за сменой строк. Возврат в -1 (новый трек) —
     *  снова вооружаем пропуск. */
    let lyricScrolled = false;
    watch(activeLyricLine, (index) => {
      if (index < 0) {
        lyricScrolled = false;
        return;
      }
      if (!lyricScrolled) {
        lyricScrolled = true;
        return;
      }
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
    const audioOpen = ref(false);
    const clipIdle = ref(false);
    const isFullscreen = ref(false);
    const clipIdleDelay = 5000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    /** pointerdown уже снял простой — клик не должен в ту же жесту ставить паузу. */
    let revealOnly = false;
    /** Тап по нижнему плееру открывает этот слой и тот же click долетает сюда. */
    let openedAt = 0;

    /** HLS-манифест жив (высоты приехали) — селекты качества/дорожек работают в HLS-режиме. */
    const clipHlsActive = computed(() => clipHlsHeights.value.length > 0);
    /** Активная дорожка: выбранная, иначе default из манифеста, иначе первая. */
    const activeAudioId = computed(
      () =>
        clipAudioId.value ??
        clipAudioTracks.value.find((track) => track.default)?.id ??
        clipAudioTracks.value[0]?.id ??
        null,
    );
    const activeAudioLabel = computed(
      () => clipAudioTracks.value.find((track) => track.id === activeAudioId.value)?.label ?? '',
    );

    /** Хост для видео-элемента клипа: композабл крепит/снимает его по этому ref. */
    const clipHostEl = ref<HTMLElement | null>(null);
    watch(clipHostEl, (el) => setClipHost(el));
    const clipTaps = clipTapHandlers();

    /** Буферизованные диапазоны активного элемента (клип — video, трек — audio)
     *  в долях длительности — полупрозрачная заливка на сикбаре. Опрос раз в
     *  500 мс: события buffered не покрывают flush, а так сброс виден сразу. */
    const bufferedRanges = ref<BufferedRange[]>([]);
    let bufferedKey = '';
    let bufferedTimer: ReturnType<typeof setInterval> | null = null;
    function pollBuffered() {
      const el = clipActive.value ? getClipVideoElement() : getAudioElement();
      const duration = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      if (!el || !duration) {
        if (bufferedKey) {
          bufferedKey = '';
          bufferedRanges.value = [];
        }
        return;
      }
      const ranges: BufferedRange[] = [];
      for (let index = 0; index < el.buffered.length; index += 1) {
        ranges.push({
          start: Math.min(1, el.buffered.start(index) / duration),
          end: Math.min(1, el.buffered.end(index) / duration),
        });
      }
      const key = ranges.map((range) => `${range.start.toFixed(3)}-${range.end.toFixed(3)}`).join('|');
      if (key === bufferedKey) return;
      bufferedKey = key;
      bufferedRanges.value = ranges;
    }
    onMounted(() => {
      pollBuffered();
      bufferedTimer = setInterval(pollBuffered, 500);
    });
    onBeforeUnmount(() => {
      if (bufferedTimer) clearInterval(bufferedTimer);
    });

    /** Качества, реально приехавшие в потоках /videos/get-url — остальные неактивны.
     *  В HLS-режиме пункты — высоты манифеста, все доступны. */
    const clipStreamQualities = computed(() => new Set(clipStreams.value.map((stream) => stream.quality)));
    function clipQualityAvailable(quality: number) {
      if (clipHlsActive.value) return true;
      return clipStreamQualities.value.has(quality);
    }

    function wake() {
      clipIdle.value = false;
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      // Спиннер и пауза: кнопки остаются. Простое только пока видео реально играет.
      if (clipBuffering.value || !playing.value) return;
      // Раскрытые очередь/текст/селекты не даём плееру уйти в простой — сначала закрыть слой.
      if (clipActive.value && expanded.value && !qualityOpen.value && !audioOpen.value && layer.value === 'now') {
        idleTimer = setTimeout(() => {
          if (clipBuffering.value || !playing.value) return;
          clipIdle.value = true;
        }, clipIdleDelay);
      }
    }

    function onQualityChip() {
      qualityOpen.value = !qualityOpen.value;
      audioOpen.value = false;
    }

    function onAudioChip() {
      audioOpen.value = !audioOpen.value;
      qualityOpen.value = false;
    }

    function pickQuality(quality: number) {
      if (!clipQualityAvailable(quality)) return;
      setClipQuality(quality);
      qualityOpen.value = false;
    }

    function pickQualityAuto() {
      setClipQualityAuto();
      qualityOpen.value = false;
    }

    function pickAudio(id: string) {
      setClipAudioId(id);
      audioOpen.value = false;
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

    watch(expanded, (open) => {
      if (open) openedAt = Date.now();
    });

    watch([clipBuffering, playing], wake);

    watch([clipActive, expanded, qualityOpen, audioOpen, layer], wake);

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
        target.closest('button, a, input, .ctx, .ctx-scrim, .lyr, .seek, .seek-bar, .p-sheet-head, .p-sheet-body, .sheet-mask, .sky-toast, .clip-quality, .clip-quality-mask'),
      );
    }

    /**
     * Тап по области клипа: одинарный — пауза/плей, двойной — полный экран.
     * Скрытый плеер клик только показывает: пауза была бы на том же жесте,
     * потому что pointerdown уже снял простой. Вешается на корень: в
     * развёрнутом плеере до самого видео тап не доходит (слоёный UI поверх),
     * а в простое клики идут через pointer-events:none слоя.
     */
    function onClipTap(event: MouseEvent) {
      if (!clipActive.value || layer.value !== 'now') return;
      if (isNoDragTarget(event.target)) return;
      if (Date.now() - openedAt < 400) {
        revealOnly = false;
        return;
      }
      const onlyReveal = revealOnly || clipIdle.value;
      revealOnly = false;
      wake();
      if (onlyReveal) return;
      clipTaps.click();
    }

    function onClipDblTap(event: MouseEvent) {
      if (!clipActive.value || layer.value !== 'now') return;
      if (isNoDragTarget(event.target)) return;
      if (revealOnly) {
        revealOnly = false;
        wake();
        return;
      }
      wake();
      clipTaps.dblclick();
    }

    function onClipPointerMove(event: PointerEvent) {
      if (!clipActive.value || event.pointerType !== 'mouse') return;
      wake();
    }

    function onPlayerDragStart(event: PointerEvent) {
      revealOnly = clipIdle.value;
      wake();
      if (sheet.value) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (isNoDragTarget(event.target)) return;
      // В клип-режиме свободная область живёт для тапов (play/pause,
      // полный экран): trackPointer глушит click через preventDefault на
      // pointerdown, поэтому драг здесь не стартуем. Свайп на сворачивание —
      // с хрома экрана (кнопка «свернуть» на месте).
      if (clipActive.value) return;
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
      positionSeconds,
      liked,
      state,
      clipMode,
      clipActive,
      clipQuality,
      clipQualities,
      clipHostEl,
      clipBuffering,
      audioLoading,
      clipFrameReady,
      bufferedRanges,
      clipQualityAvailable,
      clipHlsActive,
      clipHlsAuto,
      clipAudioTracks,
      activeAudioId,
      activeAudioLabel,
      qualityOpen,
      audioOpen,
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
      playFromQueue,
      seekRatio,
      toggleClips,
      onQualityChip,
      onAudioChip,
      pickQuality,
      pickQualityAuto,
      pickAudio,
      toggleFullscreen,
      onTop,
      openQueue,
      onClips,
      openNowMenu,
      onClipTap,
      onClipDblTap,
      onClipPointerMove,
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
