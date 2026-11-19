import { computed, defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { coverVar, artistsLine } from '@/lib/cover';
import { artistSum41, favoriteTracks } from '@/mocks/catalog';
import { useFavoritesStore } from '@/stores/favorites';
import { usePlayerStore } from '@/stores/player';

type ArtistTab = 'tracks' | 'albums';

export default defineComponent({
  name: 'ArtistPage',
  components: { AppBar, MediaOverlays, SnapshotRow, SourceBadge },
  setup() {
    const router = useRouter();
    const player = usePlayerStore();
    const favorites = useFavoritesStore();
    const artist = artistSum41;
    const tab = ref<ArtistTab>('tracks');
    const albums = computed(() => favorites.albums);
    const chips: { id: ArtistTab; label: string }[] = [
      { id: 'tracks', label: 'Треки' },
      { id: 'albums', label: 'Альбомы' },
    ];
    const { open, items, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu();

    function openAlbum(id: string) {
      router.push(`/album/${id}`);
    }

    return {
      artist,
      tab,
      chips,
      favoriteTracks,
      albums,
      favorites,
      player,
      coverVar,
      artistsLine,
      openAlbum,
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
