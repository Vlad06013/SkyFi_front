import { computed, defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import MediaRow from '@/components/MediaRow/MediaRow.vue';
import TrackRow from '@/components/TrackRow/TrackRow.vue';
import VideoRow from '@/components/VideoRow/VideoRow.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { artistsLine } from '@/lib/cover';
import { artistSum41, favoriteTracks, mockVideo } from '@/mocks/catalog';
import { usePlayerStore } from '@/stores/player';

export default defineComponent({
  name: 'SearchPage',
  components: { AppBar, MediaOverlays, MediaRow, TrackRow, VideoRow },
  setup() {
    const query = ref('');
    const history = ['sum 41', 'би-2'];
    const section = ref<'best' | 'tracks' | 'albums' | 'artists' | 'playlists' | 'videos'>('best');
    const router = useRouter();
    const player = usePlayerStore();
    const focused = ref(false);
    const hasQuery = computed(() => query.value.trim().length > 0);
    const { open, variant, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu({
      onListen: () => openArtist(),
    });

    function useHistory(item: string) {
      query.value = item;
      section.value = 'best';
    }

    function openArtist() {
      router.push(`/artist/${artistSum41.source_id}`);
      player.playSnapshot(favoriteTracks[0]);
    }

    return {
      query,
      history,
      section,
      focused,
      hasQuery,
      player,
      artistSum41,
      favoriteTracks,
      mockVideo,
      artistsLine,
      useHistory,
      openArtist,
      openSnapshotMenu,
      open,
      variant,
      top,
      right,
      sheet,
      entity,
      closeMenu,
      run,
    };
  },
});
