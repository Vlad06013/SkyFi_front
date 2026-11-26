import { computed, defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { useEntityDetails } from '@/composables/useEntityDetails';
import { coverVar, artistsLine, trackCover } from '@/lib/cover';
import { resolveUrl } from '@/lib/endpoints';
import { PLAY_SOURCE_ARTIST } from '@/lib/play-sources';
import { useFavoritesStore } from '@/stores/favorites';
import { usePlayerStore } from '@/stores/player';
import type { AlbumSnapshot, ArtistSnapshot } from '@/types';

type ArtistTab = 'tracks' | 'albums';

export default defineComponent({
  name: 'ArtistPage',
  components: { AppBar, MediaOverlays, SnapshotRow, SourceBadge },
  setup() {
    const router = useRouter();
    const player = usePlayerStore();
    const { current } = storeToRefs(player);
    const favorites = useFavoritesStore();
    const { entity, tracks, albums, hasMore, loading, loadingMore, error, retry, loadMore, sentinel } =
      useEntityDetails('artist');
    const artist = computed(() => entity.value as ArtistSnapshot | null);

    const tab = ref<ArtistTab>('tracks');
    const chips: { id: ArtistTab; label: string }[] = [
      { id: 'tracks', label: 'Треки' },
      { id: 'albums', label: 'Альбомы' },
    ];
    const { open, items, top, right, sheet, entity: menuEntity, openSnapshotMenu, closeMenu, run } =
      useMediaMenu();

    function playAll() {
      const first = tracks.value[0];
      if (first) player.playSnapshot(first, PLAY_SOURCE_ARTIST, { contextItems: tracks.value });
    }

    function isPlaying(track: { source_id: string }) {
      return current.value?.type === 'track' && current.value.source_id === track.source_id;
    }

    function openAlbum(album: AlbumSnapshot) {
      router.push(`/album/${album.source_type}/${album.source_id}`);
    }

    function albumLine(album: AlbumSnapshot): string {
      const parts: string[] = [];
      if (album.year) parts.push(album.year);
      if (album.track_count != null) parts.push(`${album.track_count} треков`);
      return parts.join(' · ');
    }

    return {
      artist,
      tracks,
      playSourceArtist: PLAY_SOURCE_ARTIST,
      albums,
      hasMore,
      loading,
      loadingMore,
      error,
      retry,
      loadMore,
      sentinel,
      tab,
      chips,
      favorites,
      player,
      playAll,
      isPlaying,
      coverVar,
      artistsLine,
      trackCover,
      resolveUrl,
      openAlbum,
      albumLine,
      openSnapshotMenu,
      open,
      items,
      top,
      right,
      sheet,
      entity: menuEntity,
      closeMenu,
      run,
    };
  },
});
