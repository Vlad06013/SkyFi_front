import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { scheduleHideScrub, scrubSeconds, scrubStyle, showScrub } from '@/lib/scrub-preview';
import { storeToRefs } from 'pinia';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SeekBar from '@/components/SeekBar/SeekBar.vue';
import type { BufferedRange } from '@/components/SeekBar/SeekBar';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { getAudioElement } from '@/composables/useAudioPlayback';
import { useLyrics } from '@/composables/useLyrics';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { clipBuffering, clipFrameReady, clipSurface, getClipVideoElement, setClipHost } from '@/composables/useVideoPlayback';
import { useSnapshotLike } from '@/composables/useSnapshotLike';
import { aheadRanges } from '@/lib/buffer-ranges';
import { coverVar, artistsLine, trackCover } from '@/lib/cover';
import { isLocalPlaybackUrl } from '@/lib/download-files';
import { resolveUrl } from '@/lib/endpoints';
import { sortRowStyle, startListSort, type ListSortState } from '@/lib/list-sort';
import { entityFromSnapshot } from '@/lib/media-menu';
import { PLAY_SOURCE_QUEUE } from '@/lib/play-sources';
import { ackQueueReveal, queueReveal, queueRevealPending } from '@/lib/player-reveal';
import { pushBackOverlay } from '@/lib/hardware-back';
import { trackPointer } from '@/lib/pointer-drag';
import { formatTime } from '@/lib/time';
import { usePlayerStore } from '@/stores/player';
import { useLayoutStore } from '@/stores/layout';

/** Пульт в простое: эти клавиши только поднимают кнопки, не жмут спрятанную. */
export function isPlayerWakeKey(event: { key: string; keyCode?: number }): boolean {
  const code = event.keyCode ?? -1;
  return (
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight' ||
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown' ||
    event.key === 'Enter' ||
    event.key === ' ' ||
    event.key === 'OK' ||
    code === 19 ||
    code === 20 ||
    code === 21 ||
    code === 22 ||
    code === 23 ||
    code === 66
  );
}
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
      if (videoCover) return resolveUrl(videoCover);
      const snap = current.value;
      if (!snap) return '';
      if (snap.type === 'track') return trackCover(snap, 600);
      return resolveUrl(snap.cover_url);
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
      return resolveUrl(snapshot.cover_url);
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
    const scrubCanvas = ref<HTMLCanvasElement | null>(null);
    const scrubBox = ref({ left: '50%', top: '40%' });
    let scrubPaint = 0;
    let scrubBlocked = false;

    function placeScrub(ratio: number) {
      const bar = rootEl.value?.querySelector('.seek-bar');
      scrubBox.value = scrubStyle(ratio, bar instanceof HTMLElement ? bar : null, rootEl.value);
    }

    /** Раскадровка выключена: drawImage с видео на телевизоре снимает кадр
     *  с быстрого слоя. Окошко в шаблоне тоже закомментировано. */
    function paintScrub() {
      if (scrubBlocked) return;
      const video = getClipVideoElement();
      const canvas = scrubCanvas.value;
      if (!video || !canvas || video.readyState < 2) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      try {
        // ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        scrubBlocked = true;
      }
    }

    function onScrub(ratio: number) {
      if (!clipActive.value || !durationSeconds.value) return;
      showScrub(ratio * durationSeconds.value);
      placeScrub(ratio);
    }

    function onScrubEnd() {
      scheduleHideScrub(400);
    }

    watch(scrubSeconds, (seconds) => {
      if (seconds == null || !durationSeconds.value) return;
      placeScrub(seconds / durationSeconds.value);
      // paintScrub(); — выключено вместе с окошком раскадровки.
      void scrubPaint;
    });
    const qualityOpen = ref(false);
    const audioOpen = ref(false);
    const clipIdle = ref(false);
    const isFullscreen = ref(false);
    const clipIdleDelay = 5000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    /** pointerdown уже снял простой — клик не должен в ту же жесту ставить паузу. */
    let revealOnly = false;

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

    /** Буферизованные диапазоны активного элемента (клип — video, трек — audio)
     *  в долях длительности — полупрозрачная заливка на сикбаре. Опрос раз в
     *  500 мс: события buffered не покрывают flush, а так сброс виден сразу.
     *  Рисуем только вперёд от плейхеда: сыгранное MSE держит до вытеснения,
     *  и полная полоса врала — «буфер есть», а запас ноль. */
    const bufferedRanges = ref<BufferedRange[]>([]);
    let bufferedKey = '';
    let bufferedTimer: ReturnType<typeof setInterval> | null = null;
    function pollBuffered() {
      const el = clipActive.value ? getClipVideoElement() : getAudioElement();
      // Локальный файл (скачанное) буферизуется с диска мгновенно: полоса
      // буфера на нём — шум, «подгрузка» ни о чём не говорит (баг 22).
      if (!clipActive.value && el && isLocalPlaybackUrl(el.src)) {
        if (bufferedKey) {
          bufferedKey = '';
          bufferedRanges.value = [];
        }
        return;
      }
      const duration = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      if (!el || !duration) {
        if (bufferedKey) {
          bufferedKey = '';
          bufferedRanges.value = [];
        }
        return;
      }
      const position = Number.isFinite(el.currentTime) ? el.currentTime : 0;
      const ranges = aheadRanges(el.buffered, position, duration);
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

    watch([clipBuffering, playing], wake);

    watch([clipActive, expanded, qualityOpen, audioOpen, layer], wake);

    function focusPlay() {
      void nextTick(() => {
        const play = rootEl.value?.querySelector('.transport .fab');
        if (play instanceof HTMLElement) play.focus();
      });
    }

    function onIdleKey(event: KeyboardEvent) {
      if (!clipIdle.value || !isPlayerWakeKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
      wake();
      focusPlay();
    }

    watch(clipIdle, (idle) => {
      if (!idle) return;
      // Фокус остаётся на «вперёд» под спрятанными кнопками — ок тогда скипает трек.
      void nextTick(() => rootEl.value?.focus());
    });

    onMounted(() => {
      wake();
      document.addEventListener('fullscreenchange', onFullscreenChange);
      window.addEventListener('keydown', onIdleKey, true);
    });

    onBeforeUnmount(() => {
      if (idleTimer) clearTimeout(idleTimer);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onIdleKey, true);
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
        '--drag-opacity': String(Math.max(0.45, 1 - playerDragY.value / 520)),
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

    let stopPlayerBack: (() => void) | null = null;
    watch(expanded, (open) => {
      stopPlayerBack?.();
      stopPlayerBack = null;
      if (!open) return;
      playerDragY.value = 0;
      focusPlay();
      // Поверх уже открытых шитов: «назад» сначала разбирает плеер.
      stopPlayerBack = pushBackOverlay(() => {
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => undefined);
          return true;
        }
        if (qualityOpen.value || audioOpen.value) {
          qualityOpen.value = false;
          audioOpen.value = false;
          return true;
        }
        onTop();
        return true;
      });
    });
    onBeforeUnmount(() => stopPlayerBack?.());

    function openQueue() {
      closeMenu();
      sheet.value = null;
      void ensureQueue();
      layer.value = layer.value === 'queue' ? 'now' : 'queue';
    }

    // Тап по системному уведомлению очереди. Ждём гидрацию: на холодном
    // старте current ещё пуст, и открывать слой рано.
    watch([queueReveal, current, queueLoaded], () => {
      if (!queueRevealPending()) return;
      if (!queueLoaded.value && !current.value) return;
      if (!current.value) {
        ackQueueReveal();
        return;
      }
      ackQueueReveal();
      closeMenu();
      sheet.value = null;
      void ensureQueue();
      expanded.value = true;
      layer.value = 'queue';
    }, { immediate: true });

    /** Чистое видео: аудио под клипом нет, режим нечем заменить. */
    const clipsLocked = computed(() => current.value?.type === 'video');

    function onClips() {
      if (clipsLocked.value) return;
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
      if (open.value) closeMenu();
      const startX = event.clientX;
      const startY = event.clientY;
      let lastDx = 0;
      let lastDy = 0;
      const clip = clipActive.value;
      playerDragging.value = true;
      playerDragY.value = 0;
      trackPointer(event, {
        move: (next) => {
          lastDx = next.clientX - startX;
          lastDy = next.clientY - startY;
          playerDragY.value = lastDy > 0 && Math.abs(lastDy) >= Math.abs(lastDx) ? lastDy : 0;
        },
        up: () => {
          const shouldClose = playerDragY.value > swipeThreshold;
          playerDragging.value = false;
          if (shouldClose) {
            collapse();
            return;
          }
          playerDragY.value = 0;
          // Короткий тап по клипу — пауза/плей. Драг глушит click, поэтому
          // решаем здесь. Свайп вниз уже обработан выше.
          if (!clip || layer.value !== 'now') return;
          if (Math.abs(lastDx) > 10 || Math.abs(lastDy) > 10) return;
          const onlyReveal = revealOnly;
          revealOnly = false;
          if (onlyReveal) return;
          void togglePlay();
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
      isTv: computed(() => useLayoutStore().profile === 'tv'),
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
      clipsLocked,
      clipActive,
      clipQuality,
      clipQualities,
      clipHostEl,
      clipBuffering,
      audioLoading,
      expandedFrame: computed(() => clipFrameReady.value && clipSurface.value === 'expanded'),
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
      scrubCanvas,
      scrubSeconds,
      scrubBox,
      onScrub,
      onScrubEnd,
      playerDragStyle,
      queueSheetStyle,
      topLabel,
      clipPoster,
      coverVar,
      artistsLine,
      trackCover,
      resolveUrl,
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
