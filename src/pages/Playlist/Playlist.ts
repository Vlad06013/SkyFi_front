import { computed, defineComponent } from 'vue';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { useEntityDetails } from '@/composables/useEntityDetails';
import { coverVar, artistsLine, snapshotCover, trackCover } from '@/lib/cover';
import { playlistContextRef } from '@/lib/context-resolver';
import { PLAY_SOURCE_PLAYLIST } from '@/lib/play-sources';
import { usePlayerStore } from '@/stores/player';
import { useFavoritesStore } from '@/stores/favorites';
import { useToastStore } from '@/stores/toast';
import type { PlaylistSnapshot } from '@/types';

export default defineComponent({
  name: 'PlaylistPage',
  components: { AppBar, MediaOverlays, SnapshotRow, SourceBadge },
  setup() {
    const player = usePlayerStore();
    const favorites = useFavoritesStore();
    const toast = useToastStore();
    const { entity, tracks, hasMore, loading, loadingMore, error, retry, loadMore, sentinel } =
      useEntityDetails('playlist');
    const playlist = computed(() => entity.value as PlaylistSnapshot | null);

    const own = computed(() => playlist.value?.source_type === 'skyfi');
    const liked = computed(() => (playlist.value ? favorites.has(playlist.value) : false));

    const { open, items, top, right, sheet, entity: menuEntity, openSnapshotMenu, closeMenu, run } =
      useMediaMenu();

    function playAll() {
      const first = tracks.value[0];
      if (first && playlist.value)
        player.playSnapshot(first, PLAY_SOURCE_PLAYLIST, {
          contextItems: tracks.value,
          contextRef: playlistContextRef(playlist.value.source_type, playlist.value.source_id),
        });
    }

    function toggleLike() {
      const target = playlist.value;
      if (!target) return;
      favorites
        .toggle(target)
        .then((added) => toast.show(target.title, added ? 'добавлено в избранное' : 'убрано из избранного'))
        .catch((cause: unknown) =>
          toast.show(cause instanceof Error ? cause.message : 'Не удалось обновить избранное', '', true),
        );
    }

    return {
      playlist,
      tracks,
      playSourcePlaylist: PLAY_SOURCE_PLAYLIST,
      hasMore,
      loading,
      loadingMore,
      error,
      retry,
      loadMore,
      sentinel,
      own,
      liked,
      favorites,
      player,
      playAll,
      toggleLike,
      coverVar,
      artistsLine,
      snapshotCover,
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
