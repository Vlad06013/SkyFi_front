import { computed, defineComponent, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { coverVar, artistsLine, trackCover } from '@/lib/cover';
import { playlistRoad, playlistRoadContent } from '@/mocks/catalog';
import { usePlayerStore } from '@/stores/player';
import { useFavoritesStore } from '@/stores/favorites';
import { useToastStore } from '@/stores/toast';
import type { AnySnapshot } from '@/types';

export default defineComponent({
  name: 'PlaylistPage',
  components: { AppBar, MediaOverlays, SnapshotRow, SourceBadge },
  setup() {
    const route = useRoute();
    const player = usePlayerStore();
    const favorites = useFavoritesStore();
    const toast = useToastStore();
    const { open, items, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu({
      onDeletePlaylist: (item) => {
        if (item.snapshot) removeFromPlaylist(item.snapshot);
      },
    });

    const playlist = computed(
      () => favorites.playlists.find((p) => p.source_id === route.params.id) ?? playlistRoad,
    );

    const own = computed(() => playlist.value.source_type === 'skyfi');

    const contentById = ref<Record<string, AnySnapshot[]>>({
      [playlistRoad.source_id]: [...playlistRoadContent],
    });
    const content = computed(() => contentById.value[String(route.params.id)] ?? []);

    function removeFromPlaylist(snapshot: AnySnapshot) {
      const id = String(route.params.id);
      const list = contentById.value[id];
      if (!list) return;
      contentById.value = {
        ...contentById.value,
        [id]: list.filter((item) => item.source_id !== snapshot.source_id),
      };
      toast.show(snapshot.title, 'удалено из плейлиста');
    }

    return {
      playlist,
      own,
      content,
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
