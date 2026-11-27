import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { usePageRefresh } from '@/composables/usePageRefresh';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { fetchSearchV2 } from '@/api/search';
import { isOfflineError } from '@/api/http';
import { artistsLine, coverVar, snapshotCover, trackCover } from '@/lib/cover';
import { formatTime } from '@/lib/time';
import { resolveUrl } from '@/lib/endpoints';
import { getSearchHistory, pushSearchHistory, clearSearchHistory } from '@/lib/search-history';
import {
  SEARCH_RESOURCES,
  defaultPill,
  mergeSearchView,
  pillsFor,
  searchContextRef,
  searchMediaType,
  viewFromSource,
  wireSection,
  type SearchPill,
  type SearchView,
} from '@/lib/search-source';
import { openSnapshot, type OpenPlayOptions } from '@/lib/open-snapshot';
import { PLAY_SOURCE_SEARCH } from '@/lib/play-sources';
import type { MenuContext, MenuEntity } from '@/lib/media-menu';
import { usePlayerStore } from '@/stores/player';
import { useFavoritesStore } from '@/stores/favorites';
import { useDownloadsStore } from '@/stores/downloads';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
import type { DownloadSearchHit } from '@/lib/download-search';
import type {
  AlbumSnapshot,
  AnySnapshot,
  ArtistSnapshot,
  SearchSection,
  SnapshotSource,
  VideoSnapshot,
  WithFavorite,
} from '@/types';

const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 1000;
const TRACKS_PER_PAGE = 20;

function snapshotMenuContext(snapshot: AnySnapshot): MenuContext {
  if (snapshot.type === 'track') return 'my-tracks';
  if (snapshot.type === 'video') return 'my-videos';
  if (snapshot.type === 'album') return 'my-albums';
  if (snapshot.type === 'artist') return 'my-artists';
  return 'my-playlists';
}

function videoDuration(video: { duration_ms: number | null }): string {
  const ms = video.duration_ms;
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
  return formatTime(ms / 1000);
}

function albumLine(album: AlbumSnapshot): string {
  const parts: string[] = [];
  if (album.year) parts.push(album.year);
  if (album.track_count != null) parts.push(`${album.track_count} треков`);
  return parts.join(' · ');
}

function emptySection<T>(): SearchSection<WithFavorite<T>> {
  return { items: [], total: 0, has_more: false };
}

export default defineComponent({
  name: 'SearchV2Page',
  components: { AppBar, MediaOverlays, SnapshotRow, SourceBadge },
  setup() {
    const query = ref('');
    const history = ref<string[]>([]);
    const resource = ref<SnapshotSource>('yandex_music');
    const section = ref<SearchPill>('best');
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
    const pills = computed(() => pillsFor(resource.value));
    const placeholder = computed(() => {
      if (resource.value === 'youtube' || resource.value === 'dzen') return 'ролик или ссылка';
      if (resource.value === 'upload') return 'трек или исполнитель';
      if (resource.value === 'skyfi') return 'плейлист';
      return 'трек, альбом, ссылка';
    });
    const emptyTitle = computed(() => {
      if (resource.value === 'upload') return 'Ищите в загрузках';
      if (resource.value === 'skyfi') return 'Ищите плейлисты SkyFi';
      if (resource.value === 'dzen') return 'Ищите ролики в Дзене';
      if (resource.value === 'youtube') return 'Ищите ролики на YouTube';
      return 'Ищите в Яндекс Музыке';
    });

    const result = ref<SearchView | null>(null);
    /** Активная секция ещё не кончилась: последняя страница принесла элементы. */
    const continues = ref(false);
    const loading = ref(false);
    const loadingMore = ref(false);
    const error = ref<string | null>(null);
    const lastRequestedPage = ref(1);

    let generation = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let searchAbort: AbortController | null = null;

    function abortSearch() {
      searchAbort?.abort();
      searchAbort = null;
    }

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
      return continues.value;
    });

    const contextRef = computed(() => searchContextRef(resource.value, section.value, q.value));

    function markFavorite<T extends AnySnapshot>(item: T): WithFavorite<T> {
      return { ...item, is_favorite: favorites.has(item) };
    }

    function downloadedView(found: DownloadSearchHit): SearchView {
      const source = resource.value;
      const ofSource = <T extends AnySnapshot>(items: T[]) =>
        items.filter((item) => item.source_type === source).map((item) => markFavorite(item));
      const tracks = ofSource(found.tracks);
      const albums = ofSource(found.albums);
      const playlists = ofSource(found.playlists);
      const bestHit = found.best && found.best.source_type === source ? markFavorite(found.best) : null;
      const pack = <T extends AnySnapshot>(items: WithFavorite<T>[]): SearchSection<WithFavorite<T>> => ({
        items,
        total: items.length,
        has_more: false,
      });
      return {
        query: q.value,
        page: 1,
        best: bestHit,
        tracks: pack(tracks),
        albums: pack(albums),
        artists: emptySection<ArtistSnapshot>(),
        playlists: pack(playlists),
        videos: emptySection<VideoSnapshot>(),
      };
    }

    function applyDownloadedSearch() {
      abortSearch();
      generation += 1;
      loading.value = false;
      loadingMore.value = false;
      error.value = null;
      continues.value = false;
      result.value = downloadedView(downloads.searchDownloaded(q.value));
    }

    const bestTitle = computed(() => best.value?.title ?? '');
    const bestCover = computed(() => (best.value ? snapshotCover(best.value) : ''));
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

    function rememberHistory() {
      void pushSearchHistory(q.value)
        .then((next) => {
          history.value = next;
        })
        .catch(() => undefined);
    }

    async function search(page: number) {
      abortSearch();
      const controller = new AbortController();
      searchAbort = controller;
      const gen = ++generation;
      lastRequestedPage.value = page;
      error.value = null;
      const sectionParam = wireSection(section.value);
      if (page === 1) {
        result.value = null;
        loading.value = true;
        continues.value = false;
      } else {
        loadingMore.value = true;
      }
      try {
        const payload = await fetchSearchV2(
          {
            q: q.value,
            resource: resource.value,
            type: searchMediaType(resource.value),
            ...(sectionParam ? { section: sectionParam } : {}),
            limit: TRACKS_PER_PAGE,
            page,
          },
          controller.signal,
        );
        if (gen !== generation || controller.signal.aborted) return;
        const incoming = sectionParam ? (payload.sections[sectionParam]?.items.length ?? 0) : 0;
        continues.value = incoming > 0;
        const view = viewFromSource(payload);
        result.value = page > 1 && result.value ? mergeSearchView(result.value, view) : view;
        if (page === 1) rememberHistory();
      } catch (cause) {
        if (gen !== generation || controller.signal.aborted) return;
        error.value = cause instanceof Error ? cause.message : 'Не удалось выполнить поиск.';
      } finally {
        if (gen === generation) {
          loading.value = false;
          loadingMore.value = false;
        }
      }
    }

    /** immediate — смена источника или пилюли, без паузы набора. */
    function kick(immediate: boolean) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      error.value = null;
      abortSearch();
      generation += 1;
      if (q.value.length < SEARCH_MIN_LENGTH) {
        loading.value = false;
        loadingMore.value = false;
        result.value = null;
        continues.value = false;
        return;
      }
      if (offline.value) {
        applyDownloadedSearch();
        debounceTimer = setTimeout(rememberHistory, SEARCH_DEBOUNCE_MS);
        return;
      }
      if (immediate) {
        void search(1);
        return;
      }
      debounceTimer = setTimeout(() => void search(1), SEARCH_DEBOUNCE_MS);
    }

    usePageRefresh(() => {
      if (q.value.length < SEARCH_MIN_LENGTH) return;
      if (offline.value) {
        applyDownloadedSearch();
        return;
      }
      return search(1);
    });

    function loadMore() {
      if (!sectionHasMore.value || !result.value) return;
      void search(result.value.page + 1);
    }

    function retry() {
      void search(lastRequestedPage.value);
    }

    function selectResource(id: SnapshotSource) {
      if (resource.value === id) return;
      resource.value = id;
      section.value = defaultPill(id);
      kick(true);
    }

    function selectSection(id: SearchPill) {
      if (section.value === id) return;
      section.value = id;
      kick(true);
    }

    watch(query, () => kick(false));

    watch(
      () => online.isOnline,
      (isOnline) => {
        if (isOnline === false) {
          if (q.value.length >= SEARCH_MIN_LENGTH) applyDownloadedSearch();
          return;
        }
        if (isOnline && q.value.length >= SEARCH_MIN_LENGTH) void search(1);
      },
    );

    const sentinel = ref<HTMLElement | null>(null);
    let observer: IntersectionObserver | null = null;

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

    onBeforeUnmount(() => {
      observer?.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
      abortSearch();
    });

    onMounted(() => {
      void getSearchHistory()
        .then((items) => {
          history.value = items;
        })
        .catch(() => undefined);
    });

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

    function openResult(snapshot: AnySnapshot | null | undefined, play?: OpenPlayOptions) {
      openSnapshot(router, snapshot, play);
    }

    async function onLike(entity: MenuEntity) {
      if (!entity.snapshot) return;
      try {
        const added = await favorites.toggle(entity.snapshot);
        if (added === null) return;
        patchFavorite(entity.snapshot, added);
        toast.show(entity.title, added ? 'добавлено в избранное' : 'убрано из избранного');
      } catch (cause) {
        if (isOfflineError(cause)) return;
        toast.show(cause instanceof Error ? cause.message : 'Не удалось обновить избранное', '', true);
      }
    }

    const { open, items, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu({
      onLike,
      onListen: (menuEntity) => openResult(menuEntity.snapshot),
    });

    function useHistory(item: string) {
      query.value = item;
    }

    const inputEl = ref<HTMLInputElement | null>(null);

    function clearQuery() {
      query.value = '';
      inputEl.value?.focus();
    }

    async function clearHistory() {
      try {
        await clearSearchHistory();
        history.value = [];
        toast.show('история поиска очищена');
      } catch {
        toast.show('Не удалось очистить историю', '', true);
      }
    }

    return {
      query,
      history,
      resources: SEARCH_RESOURCES,
      resource,
      pills,
      section,
      placeholder,
      emptyTitle,
      focused,
      hasQuery,
      offline,
      q,
      SEARCH_MIN_LENGTH,
      inputEl,
      clearQuery,
      clearHistory,
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
      contextRef,
      downloads,
      artistsLine,
      coverVar,
      videoDuration,
      trackCover,
      resolveUrl,
      albumLine,
      snapshotMenuContext,
      isPlaying,
      openResult,
      playSourceSearch: PLAY_SOURCE_SEARCH,
      loadMore,
      retry,
      selectResource,
      selectSection,
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
