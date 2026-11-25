import { computed, defineComponent, ref, watch } from 'vue';
import { usePageRefresh } from '@/composables/usePageRefresh';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import AppConfirm from '@/components/AppConfirm/AppConfirm.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import {
  fetchFriendFavorites,
  fetchFriendNowPlaying,
  fetchFriendProfile,
  fetchFriendQueue,
  reorderFriendQueue,
} from '@/api/friends';
import { coverVar, artistsLine, trackCover } from '@/lib/cover';
import { friendInitial, friendTone } from '@/lib/friends';
import { PLAY_SOURCE_SINGLE } from '@/lib/play-sources';
import { moveItem, sortRowStyle, startListSort, type ListSortState } from '@/lib/list-sort';
import { useFriendsStore } from '@/stores/friends';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type {
  AlbumSnapshot,
  AnySnapshot,
  ArtistSnapshot,
  AuthUser,
  FavoritesPayload,
  FriendNowPlayingPayload,
  PlaylistSnapshot,
  QueueItem,
} from '@/types';

type FavTab = 'tracks' | 'playlists' | 'artists' | 'albums';

function byPosition(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => a.position - b.position);
}

export default defineComponent({
  name: 'FriendPage',
  components: { AppBar, AppConfirm, MediaOverlays, SnapshotRow, SourceBadge },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const player = usePlayerStore();
    const { current } = storeToRefs(player);
    const toast = useToastStore();
    const friendsStore = useFriendsStore();
    const { open, items, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu();

    const userId = computed(() => Number(route.params.id));
    const profile = ref<AuthUser | null>(null);
    const nowPlaying = ref<FriendNowPlayingPayload | null>(null);
    const favoritesData = ref<FavoritesPayload | null>(null);
    const loading = ref(true);
    const loadError = ref<string | null>(null);

    const queue = ref<QueueItem[]>([]);
    const queueLoaded = ref(false);
    const queueOpen = ref(false);
    const sortDrag = ref<ListSortState | null>(null);
    const favTab = ref<FavTab>('tracks');

    const favChips: { id: FavTab; label: string }[] = [
      { id: 'tracks', label: 'Треки' },
      { id: 'playlists', label: 'Плейлисты' },
      { id: 'artists', label: 'Артисты' },
      { id: 'albums', label: 'Альбомы' },
    ];

    let generation = 0;

    /** Профиль + now-playing + избранное друга одним пакетом (api.md §12). */
    async function load() {
      // Страница под keep-alive: при уходе параметр роута уже не число — глушим.
      const id = userId.value;
      if (!Number.isFinite(id)) return;
      const gen = ++generation;
      loading.value = true;
      loadError.value = null;
      try {
        const id = userId.value;
        const [nextProfile, nextNowPlaying, nextFavorites] = await Promise.all([
          fetchFriendProfile(id),
          fetchFriendNowPlaying(id),
          fetchFriendFavorites(id),
        ]);
        if (gen !== generation) return;
        profile.value = nextProfile;
        nowPlaying.value = nextNowPlaying;
        favoritesData.value = nextFavorites;
      } catch (cause) {
        if (gen !== generation) return;
        loadError.value = cause instanceof Error ? cause.message : 'Не удалось загрузить';
      } finally {
        if (gen === generation) loading.value = false;
      }
    }

    usePageRefresh(() => load());

    watch(
      userId,
      () => {
        queueLoaded.value = false;
        queue.value = [];
        void load();
      },
      { immediate: true },
    );

    const snapshot = computed(() => nowPlaying.value?.snapshot ?? null);
    const watching = computed(() => snapshot.value?.type === 'video');

    const favoriteTracks = computed(() => favoritesData.value?.tracks ?? []);
    const playlists = computed(() => favoritesData.value?.playlists ?? []);
    const artists = computed(() => favoritesData.value?.artists ?? []);
    const albums = computed(() => favoritesData.value?.albums ?? []);

    /** Строки очереди друга: элементы без снапшота не рисуем. */
    const queueRows = computed(() =>
      queue.value
        .map((item) => ({ item, snapshot: item.snapshot }))
        .filter((row): row is { item: QueueItem; snapshot: AnySnapshot } => row.snapshot !== null),
    );

    function queueRowKind(row: AnySnapshot): 'track' | 'video' | 'media' {
      if (row.type === 'video') return 'video';
      if (row.type === 'track') return 'track';
      return 'media';
    }

    function queueRowCover(row: AnySnapshot): string {
      if (row.type === 'track') return trackCover(row);
      return row.cover_url ?? '';
    }

    /** Контекст меню строки чужой очереди (docs/menus.md). */
    function queueMenuContext(row: AnySnapshot): 'friend-queue-track' | 'friend-queue-video' {
      return row.type === 'video' ? 'friend-queue-video' : 'friend-queue-track';
    }

    async function loadQueue() {
      try {
        queue.value = byPosition(await fetchFriendQueue(userId.value));
        queueLoaded.value = true;
      } catch (cause) {
        toast.show(cause instanceof Error ? cause.message : 'Не удалось загрузить очередь', '', true);
      }
    }

    function toggleQueue() {
      queueOpen.value = !queueOpen.value;
      if (queueOpen.value && !queueLoaded.value) void loadQueue();
    }

    async function applyReorder(from: number, to: number) {
      if (from === to) return;
      const reorderedIds = moveItem(queue.value, from, to).map((item) => item.id);
      try {
        queue.value = byPosition(await reorderFriendQueue(userId.value, reorderedIds));
      } catch (cause) {
        toast.show(cause instanceof Error ? cause.message : 'Не удалось изменить порядок', '', true);
      }
    }

    function isPlaying(row: AnySnapshot) {
      const snap = current.value;
      return snap?.type === row.type && snap.source_id === row.source_id;
    }

    function playNow() {
      if (snapshot.value) player.playSnapshot(snapshot.value, PLAY_SOURCE_SINGLE);
    }

    function openArtist(artist: ArtistSnapshot) {
      router.push(`/artist/${artist.source_type}/${artist.source_id}`);
    }

    function openAlbum(album: AlbumSnapshot) {
      router.push(`/album/${album.source_type}/${album.source_id}`);
    }

    function openPlaylist(playlist: PlaylistSnapshot) {
      router.push(`/playlist/${playlist.source_type}/${playlist.source_id}`);
    }

    async function removeFriend() {
      const removed = await friendsStore.removeFriend(userId.value);
      if (removed) {
        toast.show(profile.value?.name ?? '', 'удалён из друзей');
        router.back();
        return;
      }
      toast.show('Не удалось удалить друга', 'попробуйте снова', true);
    }

    const confirmOpen = ref(false);

    function askRemoveFriend() {
      confirmOpen.value = true;
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
          void applyReorder(from, to);
        },
      });
    }

    return {
      userId,
      profile,
      snapshot,
      watching,
      loading,
      loadError,
      queueRows,
      queueOpen,
      queueLoaded,
      sortDrag,
      favTab,
      favChips,
      favoriteTracks,
      playlists,
      artists,
      albums,
      coverVar,
      artistsLine,
      trackCover,
      playSourceSingle: PLAY_SOURCE_SINGLE,
      friendInitial,
      friendTone,
      toggleQueue,
      isPlaying,
      playNow,
      openArtist,
      openAlbum,
      openPlaylist,
      removeFriend,
      askRemoveFriend,
      confirmOpen,
      onSort,
      queueRowKind,
      queueRowCover,
      queueMenuContext,
      sortRowStyle,
      player,
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
