import { computed, defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import MediaRow from '@/components/MediaRow/MediaRow.vue';
import TrackRow from '@/components/TrackRow/TrackRow.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { sortRowStyle, startListSort, type ListSortState } from '@/lib/list-sort';
import { plural } from '@/lib/plural';import { artistsLine } from '@/lib/cover';
import {
  favoriteAlbums,
  favoriteArtists,
  favoritePlaylists,
  trackFatLip,
  trackRadio,
} from '@/mocks/catalog';
import { usePlayerStore } from '@/stores/player';
import { useFavoritesStore } from '@/stores/favorites';
import { useToastStore } from '@/stores/toast';
import type { TrackSnapshot } from '@/types';
import type { MenuEntity } from '@/lib/media-menu';

type LibTab = 'tracks' | 'playlists' | 'albums' | 'artists' | 'uploads' | 'downloaded';

export default defineComponent({
  name: 'LibraryPage',
  components: { AppBar, MediaOverlays, MediaRow, TrackRow },
  setup() {
    const chips: { id: LibTab; label: string }[] = [
      { id: 'tracks', label: 'Треки' },
      { id: 'playlists', label: 'Плейлисты' },
      { id: 'albums', label: 'Альбомы' },
      { id: 'artists', label: 'Артисты' },
      { id: 'uploads', label: 'Загрузки' },
      { id: 'downloaded', label: 'Скачано' },
    ];

    const tab = ref<LibTab>('tracks');
    const router = useRouter();
    const player = usePlayerStore();
    const { current } = storeToRefs(player);
    const favorites = useFavoritesStore();
    const { tracks } = storeToRefs(favorites);
    const toast = useToastStore();
    const playlists = ref([...favoritePlaylists]);
    const sortDrag = ref<ListSortState | null>(null);

    const { open, variant, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu({
      onListen: (item) => listenCollection(item),
      onEdit: (item) => toast.show(item.title, 'изменение плейлиста'),
      onDelete: (item) => {
        playlists.value = playlists.value.filter((pl) => pl.source_id !== item.sourceId);
        toast.show(item.title, 'плейлист удалён');
      },
    });

    const counts = computed<Record<LibTab, string>>(() => ({
      tracks: `${tracks.value.length} ${plural(tracks.value.length, ['трек', 'трека', 'треков'])}`,
      playlists: `${playlists.value.length} ${plural(playlists.value.length, ['плейлист', 'плейлиста', 'плейлистов'])}`,
      albums: `${favoriteAlbums.length} ${plural(favoriteAlbums.length, ['альбом', 'альбома', 'альбомов'])}`,
      artists: `${favoriteArtists.length} ${plural(favoriteArtists.length, ['артист', 'артиста', 'артистов'])}`,
      uploads: '',
      downloaded: '',
    }));

    const showDownloadAll = computed(
      () => tab.value === 'tracks' || tab.value === 'playlists' || tab.value === 'albums' || tab.value === 'artists',
    );

    function isPlaying(track: TrackSnapshot) {
      const snap = current.value;
      return snap?.type === 'track' && snap.source_id === track.source_id;
    }

    function isOffline(track: TrackSnapshot) {
      return track.source_id === trackFatLip.source_id;
    }

    function isDownloaded(track: TrackSnapshot) {
      return track.source_id === trackRadio.source_id || track.source_type === 'upload';
    }

    function listenCollection(item: MenuEntity) {
      if (item.snapshot?.type === 'playlist') openPlaylist(item.sourceId);
      else if (item.snapshot?.type === 'album') openAlbum(item.sourceId);
      else if (item.snapshot?.type === 'artist') openArtist(item.sourceId);
      player.playSnapshot(tracks.value[0]);
    }

    function onSort(event: PointerEvent, index: number) {
      const container = (event.currentTarget as HTMLElement).closest('.list-sort');
      if (!(container instanceof HTMLElement)) return;
      startListSort(event, index, {
        container,
        onMove: (state) => {
          sortDrag.value = state;
        },
        onEnd: (from, to) => {
          sortDrag.value = null;
          favorites.reorder(from, to);
        },
      });
    }

    function openPlaylist(id: string) {
      router.push(`/playlist/${id}`);
    }

    function openAlbum(id: string) {
      router.push(`/album/${id}`);
    }

    function openArtist(id: string) {
      router.push(`/artist/${id}`);
    }

    return {
      chips,
      tab,
      tracks,
      playlists,
      sortDrag,
      player,
      counts,
      showDownloadAll,
      favoriteAlbums,
      favoriteArtists,
      artistsLine,
      isPlaying,
      isOffline,
      isDownloaded,
      onSort,
      sortRowStyle,
      openPlaylist,
      openAlbum,
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
