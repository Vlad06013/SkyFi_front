import { computed, defineComponent, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { mockFriends, friendQueue } from '@/mocks/friends';
import { favoriteTracks } from '@/mocks/catalog';
import { coverVar, artistsLine } from '@/lib/cover';
import { moveItem, sortRowStyle, startListSort, type ListSortState } from '@/lib/list-sort';
import { plural } from '@/lib/plural';
import { trackPointer } from '@/lib/pointer-drag';
import { useFriendsStore } from '@/stores/friends';
import { useFavoritesStore } from '@/stores/favorites';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type { TrackSnapshot } from '@/types';

const swipeThreshold = 88;
const tapSlop = 8;

export default defineComponent({
  name: 'FriendPage',
  components: { AppBar, MediaOverlays, SnapshotRow, SourceBadge },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const player = usePlayerStore();
    const toast = useToastStore();
    const friendsStore = useFriendsStore();
    const favorites = useFavoritesStore();
    const { open, items, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu();

    const queue = ref<TrackSnapshot[]>([...friendQueue]);
    const queueOpen = ref(false);
    const queueDragging = ref(false);
    const queueDragY = ref(0);
    const sortDrag = ref<ListSortState | null>(null);

    const friend = computed(
      () =>
        friendsStore.friends.find((item) => String(item.id) === String(route.params.id)) ??
        mockFriends[0],
    );

    const watching = computed(
      () => friend.value.watching && friend.value.current_snapshot?.type === 'video',
    );

    const queueCountLabel = computed(
      () => `${queue.value.length} ${plural(queue.value.length, ['трек', 'трека', 'треков'])}`,
    );

    const queueSheetStyle = computed(() => {
      if (!queueDragY.value) return undefined;
      return { transform: `translateY(${queueDragY.value}px)` };
    });

    function playNow() {
      const snapshot = friend.value.current_snapshot;
      if (snapshot) player.playSnapshot(snapshot);
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

    function onQueueHeadDrag(event: PointerEvent) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.stopPropagation();
      const startY = event.clientY;
      queueDragging.value = true;
      queueDragY.value = 0;
      trackPointer(event, {
        move: (next) => {
          queueDragY.value = Math.max(0, next.clientY - startY);
        },
        up: () => {
          const dy = queueDragY.value;
          queueDragging.value = false;
          queueDragY.value = 0;
          if (dy > swipeThreshold) {
            queueOpen.value = false;
            return;
          }
          if (dy < tapSlop) queueOpen.value = !queueOpen.value;
        },
      });
    }

    return {
      friend,
      watching,
      favoriteTracks,
      favorites,
      player,
      queue,
      queueOpen,
      queueCountLabel,
      queueDragging,
      queueSheetStyle,
      sortDrag,
      coverVar,
      artistsLine,
      playNow,
      removeFriend,
      onSort,
      sortRowStyle,
      onQueueHeadDrag,
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
