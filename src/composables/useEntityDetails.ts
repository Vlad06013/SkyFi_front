import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { usePageRefresh } from '@/composables/usePageRefresh';
import { useRoute } from 'vue-router';
import { fetchEntityDetails, type DetailsEntityType } from '@/api/details';
import { useDownloadsStore } from '@/stores/downloads';
import { useToastStore } from '@/stores/toast';
import type {
  AlbumSnapshot,
  ArtistSnapshot,
  PlaylistSnapshot,
  SnapshotSource,
  TrackSnapshot,
} from '@/types';

const DETAILS_LIMIT = 50;
const loadFailedTitle = 'Не удалось загрузить';

/**
 * Детали album/artist/playlist по роуту `/…/:source/:id`
 * (api.md §11, POST /details): тело — конверт снапшота из урла,
 * бэк резолвит сущность сам. Ошибки — тостом как в ките
 * + инлайн «Повторить». Догрузка треков — сентинел.
 */
export function useEntityDetails(type: DetailsEntityType) {
  const route = useRoute();
  const toast = useToastStore();
  const downloads = useDownloadsStore();
  const entity = ref<(AlbumSnapshot | ArtistSnapshot | PlaylistSnapshot) | null>(null);
  const tracks = ref<TrackSnapshot[]>([]);
  const albums = ref<AlbumSnapshot[]>([]);
  const hasMore = ref(false);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);

  let generation = 0;
  let currentPage = 1;

  const sourceType = computed(() => String(route.params.source ?? ''));
  const sourceId = computed(() => String(route.params.id ?? ''));

  async function load(page: number) {
    // ПРОБЛЕМА (не решена, см. docs/unthoughtout.md «Keep-alive всех
    // страниц»): TabsLayout держит под keep-alive ВСЕ страницы
    // (семантика мобильного стека навигации: ушедшие экраны живы), а
    // страницы читают живой глобальный useRoute() (SPA-стиль). Живая
    // «чужая» страница видит параметры нового роута: переход
    // artist→album заставлял artist-страницу слать фантомный /details
    // со своим type и чужим id (422 на бэке).
    //
    // Ниже — локальный гвард (грузим только при своём роуте), это
    // пластырь, а не лечение. Реальное решение на выбор: А) keep-alive
    // только корней вкладок, деталки размонтируются; Б) страницы
    // работают со снимком параметров навигации, а не с живым роутом.
    // Пока не решили — гвард стоит здесь.
    if (route.name !== type || !sourceType.value || !sourceId.value) return;
    const gen = ++generation;
    error.value = null;
    if (page === 1 && (type === 'album' || type === 'playlist')) {
      const saved = downloads.savedCollectionOf(type, sourceType.value, sourceId.value);
      if (saved?.complete) {
        entity.value = saved.snapshot;
        tracks.value = saved.tracks;
        albums.value = [];
        hasMore.value = false;
        loading.value = false;
        loadingMore.value = false;
        return;
      }
    }
    if (page === 1) {
      entity.value = null;
      tracks.value = [];
      albums.value = [];
      hasMore.value = false;
      loading.value = true;
    } else {
      loadingMore.value = true;
    }
    try {
      const payload = await fetchEntityDetails(
        { type, source_type: sourceType.value as SnapshotSource, source_id: sourceId.value },
        { page, limit: DETAILS_LIMIT },
      );
      if (gen !== generation) return;
      currentPage = page;
      entity.value = payload.entity;
      tracks.value = page === 1 ? payload.tracks.items : [...tracks.value, ...payload.tracks.items];
      albums.value = payload.albums.items;
      hasMore.value = payload.tracks.has_more;
    } catch {
      if (gen !== generation) return;
      toast.show(loadFailedTitle, '', true);
      error.value = loadFailedTitle;
    } finally {
      if (gen === generation) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }

  function retry() {
    void load(currentPage);
  }

  function loadMore() {
    if (!hasMore.value || loading.value || loadingMore.value || error.value) return;
    void load(currentPage + 1);
  }

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

  usePageRefresh(() => load(1));
  onMounted(() => void load(1));
  onBeforeUnmount(() => observer?.disconnect());

  // Переход между сущностями без размонтирования страницы.
  watch([sourceType, sourceId], () => void load(1));

  return {
    entity,
    tracks,
    albums,
    hasMore,
    loading,
    loadingMore,
    error,
    retry,
    loadMore,
    sentinel,
  };
}
