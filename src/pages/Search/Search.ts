import { computed, defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { artistsLine } from '@/lib/cover';
import { artistSum41, favoriteTracks, mockVideo } from '@/mocks/catalog';
import { usePlayerStore } from '@/stores/player';
import { useFavoritesStore } from '@/stores/favorites';
import { useDownloadsStore } from '@/stores/downloads';

export default defineComponent({
  name: 'SearchPage',
  components: { AppBar, MediaOverlays, SnapshotRow },
  setup() {
    const query = ref('');
    const history = ['sum 41', 'би-2'];
    const section = ref<'best' | 'tracks' | 'albums' | 'artists' | 'playlists' | 'videos'>('best');
    const router = useRouter();
    const player = usePlayerStore();
    const { current } = storeToRefs(player);
    const favorites = useFavoritesStore();
    const downloads = useDownloadsStore();
    const focused = ref(false);
    const hasQuery = computed(() => query.value.trim().length > 0);
    const { open, items, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu({
      onListen: () => openArtist(),
    });

    // Мок поиска: результаты приходят с is_favorite по контракту
    // (api.md §9, WithFavorite), на моках флаг считаем из стора.
    const bestArtist = computed(() => ({ ...artistSum41, is_favorite: favorites.has(artistSum41) }));
    const trackResults = computed(() =>
      favoriteTracks.map((track) => ({ ...track, is_favorite: favorites.has(track) })),
    );
    const videoResult = computed(() => ({ ...mockVideo, is_favorite: favorites.has(mockVideo) }));

    function isPlaying(snapshot: { type: string; source_id: string }) {
      return current.value?.type === snapshot.type && current.value.source_id === snapshot.source_id;
    }

    function useHistory(item: string) {
      query.value = item;
      section.value = 'best';
    }

    function openArtist() {
      router.push(`/artist/${artistSum41.source_id}`);
      player.playSnapshot(favoriteTracks[0]);
    }

    return {
      query,
      history,
      section,
      focused,
      hasQuery,
      player,
      downloads,
      bestArtist,
      trackResults,
      videoResult,
      artistsLine,
      isPlaying,
      useHistory,
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
    };
  },
});
