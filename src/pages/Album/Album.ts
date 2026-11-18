import { defineComponent } from 'vue';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import TrackRow from '@/components/TrackRow/TrackRow.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { coverVar, artistsLine } from '@/lib/cover';
import { albumHeaven, favoriteTracks } from '@/mocks/catalog';
import { usePlayerStore } from '@/stores/player';
import { useFavoritesStore } from '@/stores/favorites';

export default defineComponent({
  name: 'AlbumPage',
  components: { AppBar, MediaOverlays, SourceBadge, TrackRow },
  setup() {
    const player = usePlayerStore();
    const favorites = useFavoritesStore();
    const album = albumHeaven;
    const { open, variant, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu();

    return {
      album,
      favoriteTracks,
      favorites,
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
