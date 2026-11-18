import { computed, defineComponent } from 'vue';
import { useRoute } from 'vue-router';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import TrackRow from '@/components/TrackRow/TrackRow.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { mockFriends } from '@/mocks/friends';
import { favoriteTracks } from '@/mocks/catalog';
import { coverVar, artistsLine } from '@/lib/cover';
import { usePlayerStore } from '@/stores/player';

export default defineComponent({
  name: 'FriendPage',
  components: { AppBar, MediaOverlays, SourceBadge, TrackRow },
  setup() {
    const route = useRoute();
    const player = usePlayerStore();
    const { open, variant, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu();
    const friend = computed(
      () => mockFriends.find((f) => String(f.id) === String(route.params.id)) ?? mockFriends[0],
    );

    function playNow() {
      const snapshot = friend.value.current_snapshot;
      if (snapshot) player.playSnapshot(snapshot);
    }

    return {
      friend,
      favoriteTracks,
      player,
      coverVar,
      artistsLine,
      playNow,
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
