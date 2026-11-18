import { defineComponent } from 'vue';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import TrackRow from '@/components/TrackRow/TrackRow.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { coverVar, artistsLine } from '@/lib/cover';
import { artistSum41, favoriteTracks } from '@/mocks/catalog';
import { usePlayerStore } from '@/stores/player';

export default defineComponent({
  name: 'ArtistPage',
  components: { AppBar, MediaOverlays, SourceBadge, TrackRow },
  setup() {
    const player = usePlayerStore();
    const artist = artistSum41;
    const { open, variant, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu();

    return {
      artist,
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
