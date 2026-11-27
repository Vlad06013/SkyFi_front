import { computed, defineComponent, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { usePageRefresh } from '@/composables/usePageRefresh';
import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player';
import { useNotificationsStore } from '@/stores/notifications';
import { useOnlineStore } from '@/stores/online';
import { useLayoutStore } from '@/stores/layout';
import { useFavoritesStore } from '@/stores/favorites';
import { useSnapshotLike } from '@/composables/useSnapshotLike';
import { clipBuffering, clipFrameReady, clipSurface, resyncClipAttachment, setHomeClipHost } from '@/composables/useVideoPlayback';
import { artistsLine, coverVar, sourceTitle, trackCover } from '@/lib/cover';
import { resolveUrl } from '@/lib/endpoints';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import type { TrackSnapshot } from '@/types';

export default defineComponent({
  name: 'HomePage',
  components: { SourceBadge },
  setup() {
    const player = usePlayerStore();
    const online = useOnlineStore();
    const { current, title, artist, album, progress, progressSmooth, audioLoading, clipActive, clipMode, clipPlaybackVideo } =
      storeToRefs(player);
    const isTv = computed(() => useLayoutStore().profile === 'tv');
    /** Фактическое воспроизведение (не мнение сервера) — для иконки и пламени. */
    const playing = computed(() => player.isPlaying);
    const { togglePlay, openExpanded, skipNext, skipPrevious } = player;
    const { liked, toggleLike } = useSnapshotLike(() => player.current);

    // Волна — отдельный режим с серверной ротацией (api.md §14). Кнопка
    // входа висит, пока плеер не в волне; любое включение трека вне волны
    // снова её показывает (play_source меняется с 'wave').
    // В офлайне волны нет — кнопка «В волну» не показывается (optimizations.md).
    const showJoinWave = computed(() => player.state.play_source !== 'wave' && online.isOnline !== false);
    const joinWave = player.joinWave;

    const heroMeta = computed(() => {
      const snap = current.value;
      if (!snap) return '';
      return [artist.value, album.value, sourceTitle(snap.source_type)].filter(Boolean).join(' · ');
    });
    function onListen() {
      if (!current.value) {
        void joinWave();
        return;
      }
      void togglePlay();
    }

    function toggleClips() {
      void player.toggleClips();
    }

    /** Карусель избранного: весь список, на экране по 30, как в «Моём». */
    const SHELF_PAGE = 30;
    const favorites = useFavoritesStore();
    const { tracks: favoriteTracks } = storeToRefs(favorites);
    const shelfShown = ref(SHELF_PAGE);
    const shelfTracks = computed(() => favoriteTracks.value.slice(0, shelfShown.value));
    const shelfHasMore = computed(() => shelfShown.value < favoriteTracks.value.length);
    const shelfEl = ref<HTMLElement | null>(null);
    const shelfSentinel = ref<HTMLElement | null>(null);
    let shelfObserver: IntersectionObserver | null = null;

    function loadMoreShelf() {
      if (!shelfHasMore.value) return;
      shelfShown.value = Math.min(shelfShown.value + SHELF_PAGE, favoriteTracks.value.length);
    }

    function fillShelf() {
      const el = shelfSentinel.value;
      const root = shelfEl.value;
      if (!el || !root || !shelfHasMore.value) return;
      if (el.getBoundingClientRect().left < root.getBoundingClientRect().right + 240) {
        loadMoreShelf();
        requestAnimationFrame(fillShelf);
      }
    }

    function bindShelf() {
      shelfObserver?.disconnect();
      shelfObserver = null;
      const root = shelfEl.value;
      const target = shelfSentinel.value;
      if (!isTv.value || !root || !target || typeof IntersectionObserver === 'undefined') return;
      shelfObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            loadMoreShelf();
            requestAnimationFrame(fillShelf);
          }
        },
        { root, rootMargin: '0px 240px 0px 0px' },
      );
      shelfObserver.observe(target);
    }

    function isCurrentTrack(track: TrackSnapshot) {
      const snap = current.value;
      return snap?.type === 'track' && snap.source_type === track.source_type && snap.source_id === track.source_id;
    }

    function playFavorite(track: TrackSnapshot) {
      void player.playOrToggle(track, 'favorites', { contextItems: favoriteTracks.value });
    }

    watch([shelfEl, shelfSentinel, shelfHasMore, isTv], () => {
      void nextTick(bindShelf);
    });

    watch(favoriteTracks, () => {
      if (shelfShown.value > favoriteTracks.value.length) {
        shelfShown.value = Math.max(SHELF_PAGE, favoriteTracks.value.length);
      }
    });

    onBeforeUnmount(() => {
      shelfObserver?.disconnect();
      clearIdleTimer();
      window.removeEventListener('keydown', onHomeKey, true);
      window.removeEventListener('pointerdown', onHomePointer, true);
    });

    const coverSrc = computed(() => {
      const videoCover = clipPlaybackVideo.value?.cover_url;
      if (videoCover) return resolveUrl(videoCover);
      const snap = current.value;
      if (!snap) return '';
      if (snap.type === 'track') return trackCover(snap);
      return resolveUrl(snap.cover_url);
    });
    const discCover = computed(() => {
      const snap = current.value;
      if (!snap || snap.type !== 'track') return coverSrc.value;
      return trackCover(snap, 600);
    });
    function onHomeClipHost(el: unknown) {
      setHomeClipHost(el instanceof HTMLElement ? el : null);
    }

    /** Простой клипа на главной: кадр крупнее, полка меньше, кнопки спрятаны. */
    const CLIP_IDLE_MS = 5000;
    const clipWatch = ref(false);
    const homeActive = ref(true);
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    function clearIdleTimer() {
      if (!idleTimer) return;
      clearTimeout(idleTimer);
      idleTimer = null;
    }

    function canIdle() {
      return homeActive.value
        && isTv.value
        && clipActive.value
        && playing.value
        && !clipBuffering.value
        && !player.expanded;
    }

    function armIdle() {
      clearIdleTimer();
      if (!canIdle()) {
        clipWatch.value = false;
        return;
      }
      idleTimer = setTimeout(() => {
        idleTimer = null;
        if (canIdle()) clipWatch.value = true;
      }, CLIP_IDLE_MS);
    }

    function wakeClip() {
      clipWatch.value = false;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('.tv-hero-copy')) active.blur();
      armIdle();
    }

    function onHomeKey(event: KeyboardEvent) {
      if (!homeActive.value || !isTv.value || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!clipActive.value) return;
      if (!clipWatch.value) {
        armIdle();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      wakeClip();
    }

    function onHomePointer(event: Event) {
      if (!homeActive.value || !isTv.value || !clipActive.value) return;
      if (!clipWatch.value) {
        armIdle();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      wakeClip();
    }

    watch(
      () => [clipActive.value, playing.value, clipBuffering.value, isTv.value, player.expanded, homeActive.value] as const,
      () => {
        if (!canIdle()) {
          clipWatch.value = false;
          clearIdleTimer();
          return;
        }
        if (!clipWatch.value && !idleTimer) armIdle();
      },
      { immediate: true },
    );

    function syncIdleChrome(idle: boolean) {
      document.documentElement.classList.toggle('tv-clip-idle', idle);
    }

    watch(clipWatch, (idle) => {
      syncIdleChrome(idle);
      if (!idle) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('.tv-hero-copy')) active.blur();
    });

    // Вкладка в keep-alive: при возврате ref'ы не меняются, вотчер хостов
    // молчит — видео оставалось в парковке, и диск залипал превью при
    // играющем звуке. После активации и раскладки синкаем привязку заново.
    onActivated(() => {
      homeActive.value = true;
      void nextTick(() => requestAnimationFrame(resyncClipAttachment));
    });

    onDeactivated(() => {
      homeActive.value = false;
      clipWatch.value = false;
      syncIdleChrome(false);
      clearIdleTimer();
    });

    onBeforeUnmount(() => syncIdleChrome(false));

    onMounted(() => {
      window.addEventListener('keydown', onHomeKey, true);
      window.addEventListener('pointerdown', onHomePointer, true);
    });

    usePageRefresh(async () => {
      await player.resync();
      if (player.state.play_source === 'wave') player.invalidateWave();
    });

    const notifications = useNotificationsStore();
    const { hasUnread } = storeToRefs(notifications);
    const { toggle: toggleBell } = notifications;

    return {
      current,
      title,
      artist,
      liked,
      playing,
      progress,
      progressSmooth,
      audioLoading,
      clipActive,
      clipMode,
      clipWatch,
      clipBuffering,
      homeFrame: computed(() => clipFrameReady.value && clipSurface.value === 'home'),
      coverSrc,
      discCover,
      heroMeta,
      isTv,
      onListen,
      toggleClips,
      shelfTracks,
      shelfHasMore,
      shelfEl,
      shelfSentinel,
      isCurrentTrack,
      playFavorite,
      trackCover,
      artistsLine,
      onHomeClipHost,
      showJoinWave,
      joinWave,
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
