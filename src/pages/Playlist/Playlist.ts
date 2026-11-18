import { computed, defineComponent } from 'vue';
import { useRoute } from 'vue-router';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import TrackRow from '@/components/TrackRow/TrackRow.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { coverVar, artistsLine } from '@/lib/cover';
import { favoritePlaylists, favoriteTracks, playlistRoad } from '@/mocks/catalog';
import { usePlayerStore } from '@/stores/player';

export default defineComponent({
  name: 'PlaylistPage',
  components: { AppBar, MediaOverlays, SourceBadge, TrackRow },
  setup() {
    const route = useRoute();
    const player = usePlayerStore();
    const { open, variant, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu();

    const playlist = computed(
      () => favoritePlaylists.find((p) => p.source_id === route.params.id) ?? playlistRoad,
    );

    const own = computed(() => playlist.value.source_type === 'skyfi');

    return {
      playlist,
      own,
      favoriteTracks,
      player,
      coverVar,
      artistsLine,
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
