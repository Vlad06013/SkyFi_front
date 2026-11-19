import { computed, defineComponent, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { mockFriends, friendQueue } from '@/mocks/friends';
import { favoriteTracks } from '@/mocks/catalog';
import { coverVar, artistsLine } from '@/lib/cover';
import { moveItem, sortRowStyle, startListSort, type ListSortState } from '@/lib/list-sort';
import { useFriendsStore } from '@/stores/friends';
import { useFavoritesStore } from '@/stores/favorites';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type { TrackSnapshot } from '@/types';

type FavTab = 'tracks' | 'playlists' | 'artists' | 'albums';

export default defineComponent({
  name: 'FriendPage',
  components: { AppBar, MediaOverlays, SnapshotRow, SourceBadge },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const player = usePlayerStore();
    const { current } = storeToRefs(player);
    const toast = useToastStore();
    const friendsStore = useFriendsStore();
    const favorites = useFavoritesStore();
    const { playlists, albums, artists } = storeToRefs(favorites);
    const { open, items, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu();

    const queue = ref<TrackSnapshot[]>([...friendQueue]);
    const queueOpen = ref(false);
    const sortDrag = ref<ListSortState | null>(null);
    const favTab = ref<FavTab>('tracks');

    const favChips: { id: FavTab; label: string }[] = [
      { id: 'tracks', label: 'Треки' },
      { id: 'playlists', label: 'Плейлисты' },
      { id: 'artists', label: 'Артисты' },
      { id: 'albums', label: 'Альбомы' },
    ];

    const friend = computed(
      () =>
        friendsStore.friends.find((item) => String(item.id) === String(route.params.id)) ??
        mockFriends[0],
    );

    const watching = computed(
      () => friend.value.watching && friend.value.current_snapshot?.type === 'video',
    );

    function toggleQueue() {
      queueOpen.value = !queueOpen.value;
    }

    function isPlaying(track: TrackSnapshot) {
      const snap = current.value;
      return snap?.type === 'track' && snap.source_id === track.source_id;
    }

    function playNow() {
      const snapshot = friend.value.current_snapshot;
      if (snapshot) player.playSnapshot(snapshot);
    }

    function openArtist(id: string) {
      router.push(`/artist/${id}`);
    }

    function openAlbum(id: string) {
      router.push(`/album/${id}`);
    }

    function removeFriend() {
      friendsStore.remove(friend.value.id);
      toast.show(friend.value.name, 'удалён из друзей');
      router.back();
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
          queue.value = moveItem(queue.value, from, to);
        },
      });
    }

    return {
      friend,
      watching,
      favoriteTracks,
      favorites,
      playlists,
      albums,
      artists,
      player,
      queue,
      queueOpen,
      sortDrag,
      favTab,
      favChips,
      coverVar,
      artistsLine,
      toggleQueue,
      isPlaying,
      playNow,
      openArtist,
      openAlbum,
      removeFriend,
      onSort,
      sortRowStyle,
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
