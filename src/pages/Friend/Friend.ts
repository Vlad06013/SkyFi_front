import { computed, defineComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import TrackRow from '@/components/TrackRow/TrackRow.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { mockFriends, friendQueue } from '@/mocks/friends';
import { favoriteTracks } from '@/mocks/catalog';
import { coverVar, artistsLine } from '@/lib/cover';
import { useFriendsStore } from '@/stores/friends';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';

export default defineComponent({
  name: 'FriendPage',
  components: { AppBar, MediaOverlays, SourceBadge, TrackRow },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const player = usePlayerStore();
    const toast = useToastStore();
    const friendsStore = useFriendsStore();
    const { open, variant, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu();

    const friend = computed(
      () =>
        friendsStore.friends.find((item) => String(item.id) === String(route.params.id)) ??
        mockFriends[0],
    );

    const watching = computed(
      () => friend.value.watching && friend.value.current_snapshot?.type === 'video',
    );

    function playNow() {
      const snapshot = friend.value.current_snapshot;
      if (snapshot) player.playSnapshot(snapshot);
    }

    function removeFriend() {
      friendsStore.remove(friend.value.id);
      toast.show(friend.value.name, 'удалён из друзей');
      router.back();
    }

    return {
      friend,
      watching,
      favoriteTracks,
      friendQueue,
      player,
      coverVar,
      artistsLine,
      playNow,
      removeFriend,
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
