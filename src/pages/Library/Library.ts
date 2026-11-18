import { computed, defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import MediaRow from '@/components/MediaRow/MediaRow.vue';
import PlaylistForm from '@/components/PlaylistForm/PlaylistForm.vue';
import TrackRow from '@/components/TrackRow/TrackRow.vue';
import UploadForm from '@/components/UploadForm/UploadForm.vue';
import VideoRow from '@/components/VideoRow/VideoRow.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import type { PlaylistDraft } from '@/components/PlaylistForm/PlaylistForm';
import { sortRowStyle, startListSort, type ListSortState } from '@/lib/list-sort';
import { plural } from '@/lib/plural';
import { artistsLine } from '@/lib/cover';
import {
  downloadedTracks,
  trackFatLip,
  trackRadio,
  uploadedTracks,
} from '@/mocks/catalog';
import { usePlayerStore } from '@/stores/player';
import { useFavoritesStore } from '@/stores/favorites';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useLibraryTab, type LibraryTab } from '@/composables/useLibraryTab';
import type { PlaylistSnapshot, TrackSnapshot, Visibility } from '@/types';
import type { MenuEntity } from '@/lib/media-menu';

export default defineComponent({
  name: 'LibraryPage',
  components: { AppBar, MediaOverlays, MediaRow, PlaylistForm, TrackRow, UploadForm, VideoRow },
  setup() {
    const chips: { id: LibraryTab; label: string }[] = [
      { id: 'tracks', label: 'Треки' },
      { id: 'playlists', label: 'Плейлисты' },
      { id: 'albums', label: 'Альбомы' },
      { id: 'artists', label: 'Артисты' },
      { id: 'videos', label: 'Видео' },
      { id: 'uploads', label: 'Загрузки' },
      { id: 'downloaded', label: 'Скачано' },
    ];

    const { tab } = useLibraryTab();
    const router = useRouter();
    const player = usePlayerStore();
    const { current } = storeToRefs(player);
    const favorites = useFavoritesStore();
    const { tracks, videos, albums, artists, playlists } = storeToRefs(favorites);
    const auth = useAuthStore();
    const toast = useToastStore();
    const sortDrag = ref<ListSortState | null>(null);

    const createOpen = ref(false);
    const editing = ref<PlaylistSnapshot | null>(null);
    const uploads = ref<TrackSnapshot[]>([...uploadedTracks]);
    const downloaded = downloadedTracks;

    const { open, variant, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu({
      onListen: (item) => listenCollection(item),
      onEdit: (item) => {
        if (item.snapshot?.type === 'playlist' && item.snapshot.source_type === 'skyfi') {
          editing.value = item.snapshot;
          return;
        }
        toast.show(item.title, 'изменение — скоро');
      },
      onDelete: (item) => {
        if (item.snapshot) favorites.remove(item.snapshot);
        toast.show(
          item.title,
          item.snapshot?.type === 'playlist' && item.snapshot.source_type === 'skyfi'
            ? 'плейлист удалён'
            : 'убрано из избранного',
        );
      },
    });

    const counts = computed<Record<LibraryTab, string>>(() => ({
      tracks: `${tracks.value.length} ${plural(tracks.value.length, ['трек', 'трека', 'треков'])}`,
      playlists: `${playlists.value.length} ${plural(playlists.value.length, ['плейлист', 'плейлиста', 'плейлистов'])}`,
      albums: `${albums.value.length} ${plural(albums.value.length, ['альбом', 'альбома', 'альбомов'])}`,
      artists: `${artists.value.length} ${plural(artists.value.length, ['артист', 'артиста', 'артистов'])}`,
      videos: `${videos.value.length} видео`,
      uploads: '',
      downloaded: '',
    }));

    const showDownloadAll = computed(
      () =>
        tab.value === 'tracks' ||
        tab.value === 'playlists' ||
        tab.value === 'albums' ||
        tab.value === 'artists' ||
        tab.value === 'videos',
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

    function openCreate() {
      createOpen.value = true;
    }

    function createPlaylist(draft: PlaylistDraft) {
      const playlist: PlaylistSnapshot = {
        type: 'playlist',
        source_type: 'skyfi',
        source_id: `pl-${Date.now()}`,
        title: draft.name,
        artists: [],
        owner_name: auth.user?.name ?? 'Я',
        cover_url: draft.cover,
        item_count: 0,
      };
      favorites.add(playlist);
      createOpen.value = false;
      toast.show(draft.name, 'плейлист создан');
      router.push(`/playlist/${playlist.source_id}`);
    }

    function savePlaylist(draft: PlaylistDraft) {
      if (editing.value) {
        favorites.update(editing.value, { title: draft.name, cover_url: draft.cover });
        toast.show(draft.name, 'плейлист сохранён');
      }
      editing.value = null;
    }

    function onUpload(draft: { title: string; artists: string; album: string }) {
      const track: TrackSnapshot = {
        type: 'track',
        source_type: 'upload',
        source_id: `up-${Date.now()}`,
        title: draft.title,
        duration_ms: null,
        artists: draft.artists
          .split(',')
          .map((name) => ({ name: name.trim() }))
          .filter((artist) => artist.name),
        album: draft.album.trim() ? { title: draft.album.trim() } : null,
        stream_url: null,
      };
      uploads.value = [track, ...uploads.value];
      toast.show(track.title, 'загружено');
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
      videos,
      albums,
      artists,
      playlists,
      sortDrag,
      player,
      counts,
      showDownloadAll,
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
      createOpen,
      editing,
      uploads,
      downloaded,
      onUpload,
      openCreate,
      createPlaylist,
      savePlaylist,
    };
  },
});
