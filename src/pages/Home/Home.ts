import { computed, defineComponent, nextTick, onActivated } from 'vue';
import { usePageRefresh } from '@/composables/usePageRefresh';
import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player';
import { useNotificationsStore } from '@/stores/notifications';
import { useOnlineStore } from '@/stores/online';
import { useSnapshotLike } from '@/composables/useSnapshotLike';
import { clipBuffering, clipFrameReady, clipSurface, resyncClipAttachment, setHomeClipHost } from '@/composables/useVideoPlayback';
import { coverVar, trackCover } from '@/lib/cover';
import { resolveUrl } from '@/lib/endpoints';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';

export default defineComponent({
  name: 'HomePage',
  components: { SourceBadge },
  setup() {
    const player = usePlayerStore();
    const online = useOnlineStore();
    const { current, title, artist, progress, progressSmooth, audioLoading, clipActive, clipPlaybackVideo } =
      storeToRefs(player);
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

    const coverSrc = computed(() => {
      const videoCover = clipPlaybackVideo.value?.cover_url;
      if (videoCover) return resolveUrl(videoCover);
      const snap = current.value;
      if (!snap) return '';
      if (snap.type === 'track') return trackCover(snap);
      return resolveUrl(snap.cover_url);
    });
    function onHomeClipHost(el: unknown) {
      setHomeClipHost(el instanceof HTMLElement ? el : null);
    }

    // Вкладка в keep-alive: при возврате ref'ы не меняются, вотчер хостов
    // молчит — видео оставалось в парковке, и диск залипал превью при
    // играющем звуке. После активации и раскладки синкаем привязку заново.
    onActivated(() => {
      void nextTick(() => requestAnimationFrame(resyncClipAttachment));
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
      clipBuffering,
      homeFrame: computed(() => clipFrameReady.value && clipSurface.value === 'home'),
      coverSrc,
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
