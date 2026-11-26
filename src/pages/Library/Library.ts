import { computed, defineComponent, onBeforeUnmount, ref, watch } from 'vue';
import { usePageRefresh } from '@/composables/usePageRefresh';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import AppSheet from '@/components/AppSheet/AppSheet.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import PlaylistForm from '@/components/PlaylistForm/PlaylistForm.vue';
import UploadForm from '@/components/UploadForm/UploadForm.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import type { PlaylistDraft } from '@/components/PlaylistForm/PlaylistForm';
import type { UploadDraft } from '@/components/UploadForm/UploadForm';
import { sortRowStyle, startListSort, type ListSortState } from '@/lib/list-sort';
import { plural } from '@/lib/plural';
import { openSnapshot } from '@/lib/open-snapshot';
import { PLAY_SOURCE_FAVORITES, PLAY_SOURCE_SINGLE, PLAY_SOURCE_UPLOADS } from '@/lib/play-sources';
import { artistsLine, snapshotCover, trackCover } from '@/lib/cover';
import { resolveUrl } from '@/lib/endpoints';
import { usePlayerStore } from '@/stores/player';
import { useFavoritesStore } from '@/stores/favorites';
import { useUploadsStore } from '@/stores/uploads';
import { useDownloadsStore } from '@/stores/downloads';
import { useOnlineStore } from '@/stores/online';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useLibraryTab, type LibraryTab } from '@/composables/useLibraryTab';
import type {
  AlbumSnapshot,
  ArtistSnapshot,
  PlaylistSnapshot,
  TrackSnapshot,
  VideoSnapshot,
  Visibility,
} from '@/types';
import type { MenuEntity } from '@/lib/media-menu';

export default defineComponent({
  name: 'LibraryPage',
  components: { AppBar, AppSheet, MediaOverlays, PlaylistForm, SnapshotRow, UploadForm },
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
    const uploadOpen = ref(false);
    /** Процент ухода файла на сервер. null — загрузки нет, форма свободна. */
    const uploadPct = ref<number | null>(null);
    const editing = ref<PlaylistSnapshot | null>(null);
    const editingUpload = ref<TrackSnapshot | null>(null);
    const uploadsStore = useUploadsStore();
    const { items: uploads } = storeToRefs(uploadsStore);
    usePageRefresh(() =>
      Promise.all([
        favorites.fetchAll().catch(() => undefined),
        uploadsStore.fetchAll().catch(() => undefined),
      ]),
    );

    const downloads = useDownloadsStore();
    const online = useOnlineStore();
    const isOffline = computed(() => online.isOnline === false);
    const downloaded = computed(() => downloads.items);

    /** Экран берёт страницу из уже лежащего в кеше списка, не монтируя тысячу строк. */
    const LIST_PAGE = 30;
    const shown = ref(LIST_PAGE);
    const listSentinel = ref<HTMLElement | null>(null);
    let listObserver: IntersectionObserver | null = null;

    function activeListLength(): number {
      switch (tab.value) {
        case 'tracks':
          return tracks.value.length;
        case 'playlists':
          return playlists.value.length;
        case 'albums':
          return albums.value.length;
        case 'artists':
          return artists.value.length;
        case 'videos':
          return videos.value.length;
        case 'uploads':
          return uploads.value.length;
        case 'downloaded':
          return downloaded.value.length;
      }
    }

    const listHasMore = computed(() => shown.value < activeListLength());
    const listEmpty = computed(() => activeListLength() === 0);
    const visibleTracks = computed(() => tracks.value.slice(0, shown.value));
    const visiblePlaylists = computed(() => playlists.value.slice(0, shown.value));
    const visibleAlbums = computed(() => albums.value.slice(0, shown.value));
    const visibleArtists = computed(() => artists.value.slice(0, shown.value));
    const visibleVideos = computed(() => videos.value.slice(0, shown.value));
    const visibleUploads = computed(() => uploads.value.slice(0, shown.value));
    const visibleDownloaded = computed(() => downloaded.value.slice(0, shown.value));

    function loadMoreList() {
      if (shown.value >= activeListLength()) return;
      shown.value = Math.min(shown.value + LIST_PAGE, activeListLength());
    }

    /** Сентинел остаётся в экране, пока страница короче вьюпорта — добираем ещё одну. */
    function fillList() {
      const el = listSentinel.value;
      if (!el || shown.value >= activeListLength()) return;
      if (el.getBoundingClientRect().top < window.innerHeight + 240) {
        loadMoreList();
        requestAnimationFrame(fillList);
      }
    }

    watch(tab, () => {
      shown.value = LIST_PAGE;
      requestAnimationFrame(fillList);
    });

    watch(listSentinel, (el) => {
      listObserver?.disconnect();
      listObserver = null;
      if (!el || typeof IntersectionObserver === 'undefined') return;
      listObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            loadMoreList();
            requestAnimationFrame(fillList);
          }
        },
        { rootMargin: '240px' },
      );
      listObserver.observe(el);
    });

    onBeforeUnmount(() => listObserver?.disconnect());

    const { open, items, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu({
      onListen: (item) => listenCollection(item),
      onEdit: (item) => {
        if (item.snapshot?.type === 'playlist' && item.snapshot.source_type === 'skyfi') {
          editing.value = item.snapshot;
          return;
        }
        if (item.snapshot?.type === 'track' && item.snapshot.source_type === 'upload') {
          editingUpload.value = item.snapshot;
          uploadOpen.value = true;
          return;
        }
        toast.show(item.title, 'изменение — скоро');
      },
      onDelete: (item) => {
        if (item.snapshot?.type === 'track' && item.snapshot.source_type === 'upload') {
          void uploadsStore
            .remove(item.sourceId)
            .then(() => toast.show(item.title, 'загрузка удалена'))
            .catch((error: unknown) => {
              toast.show(error instanceof Error ? error.message : 'Не удалось удалить', '', true);
            });
          return;
        }
        if (item.snapshot) {
          void favorites
            .remove(item.snapshot)
            .then(() => {
              toast.show(
                item.title,
                item.snapshot?.type === 'playlist' && item.snapshot.source_type === 'skyfi'
                  ? 'плейлист удалён'
                  : 'убрано из избранного',
              );
            })
            .catch((error: unknown) => {
              toast.show(error instanceof Error ? error.message : 'Не удалось удалить', '', true);
            });
        }
      },
    });

    const counts = computed<Record<LibraryTab, string>>(() => ({
      tracks: `${tracks.value.length} ${plural(tracks.value.length, ['трек', 'трека', 'треков'])}`,
      playlists: `${playlists.value.length} ${plural(playlists.value.length, ['плейлист', 'плейлиста', 'плейлистов'])}`,
      albums: `${albums.value.length} ${plural(albums.value.length, ['альбом', 'альбома', 'альбомов'])}`,
      artists: `${artists.value.length} ${plural(artists.value.length, ['артист', 'артиста', 'артистов'])}`,
      videos: `${videos.value.length} видео`,
      uploads: `${uploads.value.length} ${plural(uploads.value.length, ['трек', 'трека', 'треков'])}`,
      downloaded: `${downloaded.value.length} ${plural(downloaded.value.length, ['трек', 'трека', 'треков'])}`,
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

    function isPlayingVideo(video: VideoSnapshot) {
      const snap = current.value;
      return snap?.type === 'video' && snap.source_id === video.source_id;
    }

    function isDownloaded(track: TrackSnapshot) {
      return downloads.isDownloaded(track);
    }

    const bulkKind = computed(() =>
      tab.value === 'tracks' || tab.value === 'albums' || tab.value === 'playlists' ? tab.value : null,
    );
    const dlAllList = computed(() => {
      if (tab.value === 'tracks') return tracks.value;
      if (tab.value === 'albums') return albums.value;
      if (tab.value === 'playlists') return playlists.value;
      return [];
    });
    const dlAllBusy = computed(() => Boolean(bulkKind.value) && downloads.bulk?.kind === bulkKind.value);
    const dlAllDoneCount = computed(() => dlAllList.value.filter((item) => downloads.isDownloaded(item)).length);
    /** Файл из этого списка ещё качается: кнопка уже не «скачать», хотя в счётчик он войдёт после записи. */
    const dlAllActive = computed(
      () =>
        dlAllBusy.value ||
        (tab.value === 'tracks' &&
          tracks.value.some((track) => downloads.trackFilePct(track.source_type, track.source_id) !== null)),
    );
    const dlAllPct = computed(() => {
      const job = downloads.bulk;
      if (job && bulkKind.value && job.kind === bulkKind.value && job.total > 0) {
        const raw = Math.round((job.done / job.total) * 100);
        if (job.done > 0 && job.done < job.total) return Math.max(1, Math.min(99, raw));
        return Math.min(100, raw);
      }
      const total = dlAllList.value.length;
      if (!total) return 0;
      const raw = Math.round((dlAllDoneCount.value / total) * 100);
      if (dlAllDoneCount.value > 0 && dlAllDoneCount.value < total) return Math.max(1, raw);
      return raw;
    });
    const dlAllStatus = computed(() => {
      const list = dlAllList.value;
      if (!bulkKind.value || !list.length) return 'idle' as const;
      if (dlAllDoneCount.value === list.length) return 'done' as const;
      return 'idle' as const;
    });
    const dlAllArc = computed(() => Math.round((dlAllPct.value / 100) * 94));

    function downloadAllTab() {
      if (isOffline.value) return;
      const kind = bulkKind.value;
      if (!kind) return;
      if (dlAllActive.value) {
        downloads.cancelActive();
        return;
      }
      if (kind === 'tracks') void downloads.downloadAllTracks(tracks.value);
      else void downloads.downloadAllCollections(kind, kind === 'albums' ? albums.value : playlists.value);
    }

    function listenCollection(item: MenuEntity) {
      const snapshot = item.snapshot;
      if (!snapshot) return;
      if (snapshot.type === 'playlist') openPlaylist(snapshot);
      else if (snapshot.type === 'album') openAlbum(snapshot);
      else if (snapshot.type === 'artist') openArtist(snapshot);
      player.playSnapshot(tracks.value[0], PLAY_SOURCE_FAVORITES, { contextItems: tracks.value });
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

    function openPlaylist(playlist: PlaylistSnapshot) {
      openSnapshot(router, playlist);
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
      favorites.add(playlist).catch((error: unknown) => {
        toast.show(error instanceof Error ? error.message : 'Не удалось сохранить плейлист', '', true);
      });
      createOpen.value = false;
      toast.show(draft.name, 'плейлист создан');
    }

    function savePlaylist(draft: PlaylistDraft) {
      if (editing.value) {
        favorites.update(editing.value, { title: draft.name, cover_url: draft.cover });
        toast.show(draft.name, 'плейлист сохранён');
      }
      editing.value = null;
    }

    function splitArtists(value: string): string[] {
      return value
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
    }

    function visibilityHint(visibility: Visibility): string {
      const hints: Record<Visibility, string> = {
        public: 'видят все',
        friends: 'видят друзья',
        private: 'только вы',
      };
      return hints[visibility];
    }

    async function onUpload(draft: UploadDraft) {
      if (!draft.file) {
        toast.show('Файл', 'выберите аудиофайл', true);
        return;
      }
      try {
        uploadPct.value = 0;
        const lyrics = draft.lyrics.trim();
        await uploadsStore.add(
          draft.file,
          {
            title: draft.title,
            artistNames: splitArtists(draft.artists),
            albumTitle: draft.album.trim(),
            ...(lyrics ? { lyrics } : {}),
          },
          (ratio) => {
            uploadPct.value = Math.min(100, Math.round(ratio * 100));
          },
        );
        uploadOpen.value = false;
        toast.show(draft.title, `загружено · ${visibilityHint(draft.visibility)}`);
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Не удалось загрузить', '', true);
      } finally {
        uploadPct.value = null;
      }
    }

    async function saveUpload(draft: UploadDraft) {
      const current = editingUpload.value;
      if (!current) return;
      try {
        const lyrics = draft.lyrics.trim();
        await uploadsStore.update(current.source_id, {
          title: draft.title,
          artist_names: splitArtists(draft.artists),
          album_title: draft.album.trim(),
          visibility: draft.visibility,
          ...(lyrics ? { lyrics } : {}),
        });
        editingUpload.value = null;
        uploadOpen.value = false;
        toast.show(draft.title, 'загрузка сохранена');
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Не удалось сохранить', '', true);
      }
    }

    function openUpload() {
      editingUpload.value = null;
      uploadOpen.value = true;
    }

    const uploadTitle = computed(() => (editingUpload.value ? 'Изменить трек' : 'Загрузить трек'));

    function openAlbum(album: AlbumSnapshot) {
      openSnapshot(router, album);
    }

    function openArtist(artist: ArtistSnapshot) {
      openSnapshot(router, artist);
    }

    return {
      chips,
      tab,
      tracks,
      videos,
      albums,
      artists,
      playlists,
      visibleTracks,
      visibleVideos,
      visibleAlbums,
      visibleArtists,
      visiblePlaylists,
      visibleUploads,
      visibleDownloaded,
      listHasMore,
      listEmpty,
      listSentinel,
      sortDrag,
      player,
      favorites,
      playSourceFavorites: PLAY_SOURCE_FAVORITES,
      playSourceUploads: PLAY_SOURCE_UPLOADS,
      playSourceSingle: PLAY_SOURCE_SINGLE,
      counts,
      showDownloadAll,
      artistsLine,
      snapshotCover,
      trackCover,
      resolveUrl,
      isPlaying,
      isPlayingVideo,
      isDownloaded,
      dlAllStatus,
      dlAllBusy,
      dlAllActive,
      dlAllDoneCount,
      dlAllPct,
      dlAllArc,
      isOffline,
      downloadAllTab,
      onSort,
      sortRowStyle,
      openPlaylist,
      openAlbum,
      openArtist,
      openSnapshotMenu,
      open,
      items,
      top,
      right,
      sheet,
      entity,
      closeMenu,
      run,
      createOpen,
      uploadOpen,
      uploadPct,
      editing,
      editingUpload,
      uploads,
      downloaded,
      onUpload,
      saveUpload,
      openUpload,
      uploadTitle,
      openCreate,
      createPlaylist,
      savePlaylist,
    };
  },
});
