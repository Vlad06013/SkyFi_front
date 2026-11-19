import { computed, defineComponent } from 'vue';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { useEntityDetails } from '@/composables/useEntityDetails';
import { coverVar, artistsLine, trackCover } from '@/lib/cover';
import { usePlayerStore } from '@/stores/player';
import { useFavoritesStore } from '@/stores/favorites';
import type { AlbumSnapshot } from '@/types';

export default defineComponent({
  name: 'AlbumPage',
  components: { AppBar, MediaOverlays, SnapshotRow, SourceBadge },
  setup() {
    const player = usePlayerStore();
    const { current } = storeToRefs(player);
    const favorites = useFavoritesStore();
    const { entity, tracks, hasMore, loading, loadingMore, error, retry, loadMore, sentinel } =
      useEntityDetails('album');
    const album = computed(() => entity.value as AlbumSnapshot | null);

    const { open, items, top, right, sheet, entity: menuEntity, openSnapshotMenu, closeMenu, run } =
      useMediaMenu();

    function playAll() {
      const first = tracks.value[0];
      if (first) player.playSnapshot(first);
    }

    function isPlaying(track: { source_id: string }) {
      return current.value?.type === 'track' && current.value.source_id === track.source_id;
    }

    return {
      album,
      tracks,
      hasMore,
      loading,
      loadingMore,
      error,
      retry,
      loadMore,
      sentinel,
      favorites,
      player,
      playAll,
      isPlaying,
      coverVar,
      artistsLine,
      trackCover,
      openSnapshotMenu,
      open,
      items,
      top,
      right,
      sheet,
      entity: menuEntity,
      closeMenu,
      run,
    };
  },
});
