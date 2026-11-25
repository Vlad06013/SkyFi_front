import { defineStore } from 'pinia';
import { computed, ref, watch, type Ref } from 'vue';
import { addFavorite, fetchFavorites, removeFavorite, sortFavorites } from '@/api/favorites';
import { clearFavoritesCache, loadFavoritesCache, saveFavoritesCache } from '@/lib/library-cache';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import type {
  AlbumSnapshot,
  AnySnapshot,
  ArtistSnapshot,
  FavoritesPayload,
  PlaylistSnapshot,
  TrackSnapshot,
  VideoSnapshot,
} from '@/types';

function sameIdentity(a: AnySnapshot, b: AnySnapshot) {
  return a.type === b.type && a.source_type === b.source_type && a.source_id === b.source_id;
}

export const useFavoritesStore = defineStore('favorites', () => {
  const sections: Record<AnySnapshot['type'], Ref<AnySnapshot[]>> = {
    track: ref([]),
    video: ref([]),
    album: ref([]),
    artist: ref([]),
    playlist: ref([]),
  };

  /** Все вкладки загружены с сервера хотя бы раз. */
  const loaded = ref(false);

  const tracks = computed(() => sections.track.value as TrackSnapshot[]);
  const videos = computed(() => sections.video.value as VideoSnapshot[]);
  const albums = computed(() => sections.album.value as AlbumSnapshot[]);
  const artists = computed(() => sections.artist.value as ArtistSnapshot[]);
  const playlists = computed(() => sections.playlist.value as PlaylistSnapshot[]);

  function has(snapshot: AnySnapshot | null | undefined) {
    if (!snapshot) return false;
    return sections[snapshot.type].value.some((item) => sameIdentity(item, snapshot));
  }

  function applyAdd(snapshot: AnySnapshot) {
    const section = sections[snapshot.type];
    if (section.value.some((item) => sameIdentity(item, snapshot))) return;
    section.value = [snapshot, ...section.value];
    persist();
  }

  function applyRemove(snapshot: AnySnapshot) {
    const section = sections[snapshot.type];
    section.value = section.value.filter((item) => !sameIdentity(item, snapshot));
    persist();
  }

  function payloadFromMemory(): FavoritesPayload {
    return {
      tracks: sections.track.value as TrackSnapshot[],
      videos: sections.video.value as VideoSnapshot[],
      albums: sections.album.value as AlbumSnapshot[],
      artists: sections.artist.value as ArtistSnapshot[],
      playlists: sections.playlist.value as PlaylistSnapshot[],
    };
  }

  function applyPayload(payload: FavoritesPayload) {
    sections.track.value = payload.tracks;
    sections.video.value = payload.videos;
    sections.album.value = payload.albums;
    sections.artist.value = payload.artists;
    sections.playlist.value = payload.playlists;
  }

  /** Последнее состояние вкладок — в базу текущего пользователя. */
  function persist() {
    const userId = useAuthStore().user?.id;
    if (!userId) return;
    void saveFavoritesCache(userId, payloadFromMemory());
  }

  function hasAny() {
    return Object.values(sections).some((section) => section.value.length > 0);
  }

  function clearAll() {
    for (const section of Object.values(sections)) section.value = [];
    loaded.value = false;
    void clearFavoritesCache();
  }

  /** Вкладки целиком с сервера (api.md §10). Успех перезаписывает базу. */
  async function fetchAll() {
    const payload = await fetchFavorites();
    applyPayload(payload);
    loaded.value = true;
    persist();
  }

  async function add(snapshot: AnySnapshot) {
    if (has(snapshot)) return;
    applyAdd(snapshot);
    try {
      await addFavorite(snapshot);
    } catch (error) {
      applyRemove(snapshot);
      throw error;
    }
  }

  async function remove(snapshot: AnySnapshot) {
    const section = sections[snapshot.type];
    const index = section.value.findIndex((item) => sameIdentity(item, snapshot));
    if (index === -1) return;
    applyRemove(snapshot);
    try {
      await removeFavorite(snapshot);
    } catch (error) {
      section.value = [...section.value.slice(0, index), snapshot, ...section.value.slice(index)];
      persist();
      throw error;
    }
  }

  /** Возвращает итоговое состояние лайка (true — в избранном). */
  async function toggle(snapshot: AnySnapshot) {
    if (has(snapshot)) {
      await remove(snapshot);
      return false;
    }
    await add(snapshot);
    return true;
  }

  /**
   * Drag&drop вкладки «Треки»: локально + PATCH /favorites/sort.
   * Ошибка синка тихая — при следующей загрузке встанет серверный порядок.
   */
  function reorder(from: number, to: number) {
    if (from === to) return;
    const section = sections.track;
    const next = [...section.value];
    if (from < 0 || to < 0 || from >= next.length || to >= next.length) return;
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    section.value = next;
    persist();
    const items = next.map((snapshot, index) => ({
      source_type: snapshot.source_type,
      source_id: snapshot.source_id,
      sort: next.length - 1 - index,
    }));
    void sortFavorites('track', items).catch(() => undefined);
  }

  /** Локальная правка плейлиста до следующего ответа сервера. */
  function update(snapshot: AnySnapshot, patch: { title?: string; cover_url?: string | null }) {
    const section = sections[snapshot.type];
    section.value = section.value.map((item) =>
      sameIdentity(item, snapshot) ? { ...item, ...patch } : item,
    );
    persist();
  }

  // Автозагрузка: кеш из базы сразу, сервер — когда есть сеть.
  // Серверный ответ и правки списка перезаписывают базу.
  // Выход чистит чужие данные.
  const auth = useAuthStore();
  watch(
    () => [auth.isAuthed, auth.user?.id ?? null, useOnlineStore().isOnline] as const,
    ([authed, userId, online]) => {
      if (authed && userId && !loaded.value) {
        void loadFavoritesCache(userId).then((payload) => {
          if (!payload || loaded.value || useAuthStore().user?.id !== userId) return;
          applyPayload(payload);
        });
      }
      if (authed && online && !loaded.value) {
        void fetchAll().catch(() => undefined);
      }
      if (!authed && (loaded.value || hasAny())) {
        clearAll();
      }
    },
    { immediate: true },
  );

  return {
    tracks,
    videos,
    albums,
    artists,
    playlists,
    loaded,
    has,
    add,
    remove,
    toggle,
    reorder,
    update,
    fetchAll,
  };
});
