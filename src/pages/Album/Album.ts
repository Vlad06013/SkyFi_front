import { computed, defineComponent } from 'vue';
import { useRoute } from 'vue-router';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { coverVar, artistsLine, trackCover } from '@/lib/cover';
import { albumMixtape, favoriteTracks } from '@/mocks/catalog';
import { usePlayerStore } from '@/stores/player';
import { useFavoritesStore } from '@/stores/favorites';

export default defineComponent({
  name: 'AlbumPage',
  components: { AppBar, MediaOverlays, SnapshotRow, SourceBadge },
  setup() {
    const route = useRoute();
    const player = usePlayerStore();
    const favorites = useFavoritesStore();
    const album = computed(
      () => favorites.albums.find((item) => item.source_id === String(route.params.id)) ?? albumMixtape,
    );
    const { open, items, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu();

    return {
      album,
      favoriteTracks,
      favorites,
      player,
      coverVar,
      artistsLine,
      trackCover,
      openSnapshotMenu,
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
