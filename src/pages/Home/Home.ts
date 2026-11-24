import { computed, defineComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player';
import { useNotificationsStore } from '@/stores/notifications';
import { useSnapshotLike } from '@/composables/useSnapshotLike';
import { clipBuffering } from '@/composables/useVideoPlayback';
import { coverVar, trackCover } from '@/lib/cover';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import OfflineBanner from '@/components/OfflineBanner/OfflineBanner.vue';

export default defineComponent({
  name: 'HomePage',
  components: { SourceBadge, OfflineBanner },
  setup() {
    const player = usePlayerStore();
    const { current, title, artist, progress, progressSmooth, audioLoading } = storeToRefs(player);
    /** Фактическое воспроизведение (не мнение сервера) — для иконки и пламени. */
    const playing = computed(() => player.isPlaying);
    const { togglePlay, openExpanded, skipNext, skipPrevious } = player;
    const { liked, toggleLike } = useSnapshotLike(() => player.current);

    // Волна — отдельный режим с серверной ротацией (api.md §14). Кнопка
    // входа висит, пока плеер не в волне; любое включение трека вне волны
    // снова её показывает (play_source меняется с 'wave').
    const showJoinWave = computed(() => player.state.play_source !== 'wave');
    const joinWave = player.joinWave;

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
      clipBuffering,
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
      trackCover,
    };
  },
});
