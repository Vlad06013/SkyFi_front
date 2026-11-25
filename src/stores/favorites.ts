import { defineStore } from 'pinia';
import { computed, ref, watch, type Ref } from 'vue';
import { addFavorite, fetchFavorites, removeFavorite, sortFavorites } from '@/api/favorites';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import type {
  AlbumSnapshot,
  AnySnapshot,
  ArtistSnapshot,
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
  }

  function applyRemove(snapshot: AnySnapshot) {
    const section = sections[snapshot.type];
    section.value = section.value.filter((item) => !sameIdentity(item, snapshot));
  }

  function clearAll() {
    for (const section of Object.values(sections)) section.value = [];
    loaded.value = false;
  }

  /** Вкладки целиком с сервера (api.md §10). */
  async function fetchAll() {
    const payload = await fetchFavorites();
    sections.track.value = payload.tracks;
    sections.video.value = payload.videos;
    sections.album.value = payload.albums;
    sections.artist.value = payload.artists;
    sections.playlist.value = payload.playlists;
    loaded.value = true;
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
  }

  // Автозагрузка: вход/восстановление сессии + возврат онлайна —
  // один стор сам решает, когда списки актуальны. Выход чистит чужие данные.
  const auth = useAuthStore();
  watch(
    () => [auth.isAuthed, useOnlineStore().isOnline] as const,
    ([authed, online]) => {
      if (authed && online && !loaded.value) {
        void fetchAll().catch(() => undefined);
      }
      if (!authed && loaded.value) {
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
