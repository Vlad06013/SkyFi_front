import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { fetchSearch } from '@/api/search';
import { artistsLine, trackCover } from '@/lib/cover';
import { getSearchHistory, pushSearchHistory } from '@/lib/search-history';
import type { MenuContext, MenuEntity } from '@/lib/media-menu';
import { usePlayerStore } from '@/stores/player';
import { useFavoritesStore } from '@/stores/favorites';
import { useDownloadsStore } from '@/stores/downloads';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
import type { AlbumSnapshot, AnySnapshot, SearchPagePayload, SearchSection, WithFavorite } from '@/types';

type Section = 'best' | 'tracks' | 'albums' | 'artists' | 'playlists' | 'videos';

type SearchSections = Omit<SearchPagePayload, 'query' | 'page' | 'best'>;

const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 350;
const TRACKS_PER_PAGE = 20;

/** Догрузка страницы: секции дописываются (design/phone/search.html — «прокрутка вниз берёт page++»). */
function mergeSections(prev: SearchSections, next: SearchSections): SearchSections {
  return {
    tracks: { ...next.tracks, items: [...prev.tracks.items, ...next.tracks.items] },
    albums: { ...next.albums, items: [...prev.albums.items, ...next.albums.items] },
    artists: { ...next.artists, items: [...prev.artists.items, ...next.artists.items] },
    playlists: { ...next.playlists, items: [...prev.playlists.items, ...next.playlists.items] },
    videos: { ...next.videos, items: [...prev.videos.items, ...next.videos.items] },
  };
}

function snapshotMenuContext(snapshot: AnySnapshot): MenuContext {
  if (snapshot.type === 'track') return 'my-tracks';
  if (snapshot.type === 'video') return 'my-videos';
  if (snapshot.type === 'album') return 'my-albums';
  if (snapshot.type === 'artist') return 'my-artists';
  return 'my-playlists';
}

function albumLine(album: AlbumSnapshot): string {
  const parts: string[] = [];
  if (album.year) parts.push(album.year);
  if (album.track_count != null) parts.push(`${album.track_count} треков`);
  return parts.join(' · ');
}

export default defineComponent({
  name: 'SearchPage',
  components: { AppBar, MediaOverlays, SnapshotRow },
  setup() {
    const query = ref('');
    const history = ref<string[]>([]);
    const section = ref<Section>('best');
    const focused = ref(false);
    const router = useRouter();
    const player = usePlayerStore();
    const { current } = storeToRefs(player);
    const favorites = useFavoritesStore();
    const downloads = useDownloadsStore();
    const online = useOnlineStore();
    const toast = useToastStore();

    const q = computed(() => query.value.trim());
    const hasQuery = computed(() => q.value.length > 0);
    const offline = computed(() => online.isOnline === false);

    const result = ref<SearchPagePayload | null>(null);
    const loading = ref(false);
    const loadingMore = ref(false);
    const error = ref<string | null>(null);
    const lastRequestedPage = ref(1);

    let generation = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const trackResults = computed(() => result.value?.tracks.items ?? []);
    const albumResults = computed(() => result.value?.albums.items ?? []);
    const artistResults = computed(() => result.value?.artists.items ?? []);
    const playlistResults = computed(() => result.value?.playlists.items ?? []);
    const videoResults = computed(() => result.value?.videos.items ?? []);
    const best = computed(() => result.value?.best ?? null);

    const sectionItems = computed<AnySnapshot[]>(() => {
      if (section.value === 'tracks') return trackResults.value;
      if (section.value === 'albums') return albumResults.value;
      if (section.value === 'artists') return artistResults.value;
      if (section.value === 'playlists') return playlistResults.value;
      if (section.value === 'videos') return videoResults.value;
      return [];
    });

    const sectionHasMore = computed(() => {
      if (!result.value || section.value === 'best') return false;
      if (loading.value || loadingMore.value || error.value) return false;
      const sections: SearchSections = result.value;
      return sections[section.value].has_more;
    });

    const bestTitle = computed(() => best.value?.title ?? '');

    const bestCover = computed(() => {
      const snap = best.value;
      if (!snap) return '';
      return snap.type === 'track' ? trackCover(snap) : (snap.cover_url ?? '');
    });

    const bestSubtitle = computed(() => {
      const snap = best.value;
      if (!snap) return '';
      if (snap.type === 'artist') return 'Исполнитель';
      if (snap.type === 'album') return 'Альбом';
      if (snap.type === 'playlist') return 'Плейлист';
      const line = artistsLine(snap.artists ?? []);
      if (snap.type === 'video') return line ? `${line} · клип` : 'Клип';
      return line;
    });

    function isPlaying(snapshot: { type: string; source_id: string }) {
      return current.value?.type === snapshot.type && current.value.source_id === snapshot.source_id;
    }

    async function search(page: number) {
      const gen = ++generation;
      lastRequestedPage.value = page;
      error.value = null;
      if (page === 1) {
        result.value = null;
        loading.value = true;
      } else {
        loadingMore.value = true;
      }
      try {
        const payload = await fetchSearch({ q: q.value, limit: TRACKS_PER_PAGE, page });
        if (gen !== generation) return;
        result.value =
          page > 1 && result.value
            ? { ...payload, ...mergeSections(result.value, payload) }
            : payload;
        if (page === 1) {
          void pushSearchHistory(q.value)
            .then((next) => {
              history.value = next;
            })
            .catch(() => undefined);
        }
      } catch (cause) {
        if (gen !== generation) return;
        error.value = cause instanceof Error ? cause.message : 'Не удалось выполнить поиск.';
      } finally {
        if (gen === generation) {
          loading.value = false;
          loadingMore.value = false;
        }
      }
    }

    function loadMore() {
      if (!sectionHasMore.value || !result.value) return;
      void search(result.value.page + 1);
    }

    function retry() {
      void search(lastRequestedPage.value);
    }

    watch(query, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      error.value = null;
      if (offline.value || q.value.length < SEARCH_MIN_LENGTH) {
        // Гасим летящий запрос: его finally не тронет флаги (gen устарел).
        generation++;
        loading.value = false;
        loadingMore.value = false;
        result.value = null;
        return;
      }
      debounceTimer = setTimeout(() => void search(1), SEARCH_DEBOUNCE_MS);
    });

    // Возврат онлайна с введённым запросом — догоняем выдачу сами.
    watch(
      () => online.isOnline,
      (isOnline) => {
        if (isOnline && hasQuery.value && q.value.length >= SEARCH_MIN_LENGTH && !result.value) {
          void search(1);
        }
      },
    );

    const sentinel = ref<HTMLElement | null>(null);
    let observer: IntersectionObserver | null = null;

    // Пагинация по прокрутке: сентинел в конце списка, без кнопок.
    watch(sentinel, (el) => {
      observer?.disconnect();
      observer = null;
      if (!el || typeof IntersectionObserver === 'undefined') return;
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) loadMore();
        },
        { rootMargin: '240px' },
      );
      observer.observe(el);
    });

    onBeforeUnmount(() => observer?.disconnect());

    onMounted(() => {
      void getSearchHistory()
        .then((items) => {
          history.value = items;
        })
        .catch(() => undefined);
    });

    /** is_favorite в выдаче пришёл с сервера — после лайка правим флаг локально. */
    function patchFavorite(snapshot: AnySnapshot, value: boolean) {
      const payload = result.value;
      if (!payload) return;
      const match = (item: AnySnapshot) =>
        item.type === snapshot.type &&
        item.source_type === snapshot.source_type &&
        item.source_id === snapshot.source_id;
      const mapSection = <T extends AnySnapshot>(sec: SearchSection<WithFavorite<T>>) => ({
        ...sec,
        items: sec.items.map((item) => (match(item) ? { ...item, is_favorite: value } : item)),
      });
      result.value = {
        ...payload,
        tracks: mapSection(payload.tracks),
        albums: mapSection(payload.albums),
        artists: mapSection(payload.artists),
        playlists: mapSection(payload.playlists),
        videos: mapSection(payload.videos),
        best: payload.best && match(payload.best) ? { ...payload.best, is_favorite: value } : payload.best,
      };
    }

    function openResult(snapshot: AnySnapshot | null | undefined) {
      if (!snapshot) return;
      if (snapshot.type === 'track' || snapshot.type === 'video') {
        player.playSnapshot(snapshot);
        return;
      }
      const paths = { album: '/album', artist: '/artist', playlist: '/playlist' } as const;
      void router.push(`${paths[snapshot.type]}/${snapshot.source_id}`);
    }

    async function onLike(entity: MenuEntity) {
      if (!entity.snapshot) return;
      try {
        const added = await favorites.toggle(entity.snapshot);
        patchFavorite(entity.snapshot, added);
        toast.show(entity.title, added ? 'добавлено в избранное' : 'убрано из избранного');
      } catch (cause) {
        toast.show(cause instanceof Error ? cause.message : 'Не удалось обновить избранное', '', true);
      }
    }

    const { open, items, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu({
      onLike,
      onListen: (menuEntity) => openResult(menuEntity.snapshot),
    });

    function useHistory(item: string) {
      query.value = item;
      section.value = 'best';
    }

    return {
      query,
      history,
      section,
      focused,
      hasQuery,
      offline,
      q,
      SEARCH_MIN_LENGTH,
      loading,
      loadingMore,
      error,
      result,
      best,
      bestTitle,
      bestSubtitle,
      bestCover,
      trackResults,
      albumResults,
      artistResults,
      playlistResults,
      videoResults,
      sectionItems,
      sectionHasMore,
      sentinel,
      player,
      downloads,
      artistsLine,
      trackCover,
      albumLine,
      snapshotMenuContext,
      isPlaying,
      openResult,
      loadMore,
      retry,
      useHistory,
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
