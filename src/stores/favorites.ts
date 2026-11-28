import { defineStore } from 'pinia';
import { computed, ref, watch, type Ref } from 'vue';
import { Preferences } from '@capacitor/preferences';
import { addFavorite, fetchFavorites, moveFavorite, removeFavorite } from '@/api/favorites';
import { clearFavoritesCache, loadFavoritesCache, saveFavoritesCache } from '@/lib/library-cache';
import { useAuthStore } from '@/stores/auth';
import { usePlayerStore } from '@/stores/player';
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

/**
 * Буфер офлайн-удалений из избранного (optimizations.md «Лайки/дизлайки
 * в офлайне»): офлайн-«убрать из избранного» работает локально и
 * складывается сюда с позицией; повторное сердечко отменяет запись и
 * возвращает трек на место; при коннекте буфер уходит на сервер
 * (DELETE favorites). Новые лайки офлайн нельзя.
 */
interface BufferedRemoval {
  /** Полный снапшот: DELETE favorites принимает его в теле. */
  snapshot: AnySnapshot;
  /** Позиция в своей секции на момент удаления (для отмены). */
  index: number;
}

/**
 * Буфер офлайн-сортировки (баг 21): переносы драгом в офлайне применяются
 * локально и складываются сюда; при коннекте уходят на сервер по одному
 * PATCH /favorites/sort в исходном порядке — финальный порядок сервера
 * сходится с локальным.
 */
interface BufferedSortMove {
  source_type: AnySnapshot['source_type'];
  source_id: string;
  to: number;
}

const MAX_BUFFERED = 300;

function bufferStorageKey(userId: number) {
  return `skyfi.fav-removals.${userId}`;
}

function sortStorageKey(userId: number) {
  return `skyfi.fav-sort.${userId}`;
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

  const removalBuffer = ref<BufferedRemoval[]>([]);
  const sortBuffer = ref<BufferedSortMove[]>([]);
  let bufferUserId: number | null = null;
  let bufferSaveTimer: ReturnType<typeof setTimeout> | null = null;

  function persistBuffer() {
    if (bufferSaveTimer) clearTimeout(bufferSaveTimer);
    bufferSaveTimer = setTimeout(() => {
      bufferSaveTimer = null;
      if (bufferUserId == null) return;
      void Preferences.set({ key: bufferStorageKey(bufferUserId), value: JSON.stringify(removalBuffer.value) }).catch(
        () => undefined,
      );
      void Preferences.set({ key: sortStorageKey(bufferUserId), value: JSON.stringify(sortBuffer.value) }).catch(
        () => undefined,
      );
    }, 500);
  }

  /** Хвост прошлой сессии: офлайн-правки переживают перезапуск. */
  async function loadBuffer(userId: number) {
    try {
      const { value } = await Preferences.get({ key: bufferStorageKey(userId) });
      if (value && bufferUserId === userId) {
        const parsed = JSON.parse(value) as BufferedRemoval[];
        if (Array.isArray(parsed)) {
          const known = new Set(removalBuffer.value.map((entry) => `${entry.snapshot.type}:${entry.snapshot.source_type}:${entry.snapshot.source_id}`));
          const fresh = parsed.filter(
            (entry) => !known.has(`${entry.snapshot.type}:${entry.snapshot.source_type}:${entry.snapshot.source_id}`),
          );
          removalBuffer.value = [...removalBuffer.value, ...fresh].slice(-MAX_BUFFERED);
        }
      }
    } catch {
      /* битый кеш — не страшно, буфер best-effort */
    }
    try {
      const { value } = await Preferences.get({ key: sortStorageKey(userId) });
      if (value && bufferUserId === userId) {
        const parsed = JSON.parse(value) as BufferedSortMove[];
        if (Array.isArray(parsed)) sortBuffer.value = [...sortBuffer.value, ...parsed].slice(-MAX_BUFFERED);
      }
    } catch {
      /* битый кеш — не страшно, буфер best-effort */
    }
  }

  function bufferedRemoval(snapshot: AnySnapshot) {
    return removalBuffer.value.find((entry) => sameIdentity(entry.snapshot, snapshot));
  }

  /** Офлайн-«убрать из избранного»: локально + в буфер (отправка при коннекте). */
  function removeOffline(snapshot: AnySnapshot) {
    const section = sections[snapshot.type];
    const index = section.value.findIndex((item) => sameIdentity(item, snapshot));
    if (index === -1) return;
    applyRemove(snapshot);
    if (!bufferedRemoval(snapshot)) {
      removalBuffer.value = [...removalBuffer.value, { snapshot, index }].slice(-MAX_BUFFERED);
      persistBuffer();
    }
  }

  /** Отмена офлайн-удаления: запись из буфера, трек обратно на позицию. */
  function cancelOfflineRemoval(snapshot: AnySnapshot): boolean {
    const entry = bufferedRemoval(snapshot);
    if (!entry) return false;
    removalBuffer.value = removalBuffer.value.filter((item) => item !== entry);
    const section = sections[entry.snapshot.type];
    const index = Math.min(entry.index, section.value.length);
    section.value = [...section.value.slice(0, index), entry.snapshot, ...section.value.slice(index)];
    persist();
    persistBuffer();
    return true;
  }

  /** Коннект: буфер удалений уходит на сервер; неотправленное остаётся до следующего раза. */
  async function flushBufferedRemovals(): Promise<boolean> {
    if (!removalBuffer.value.length || useOnlineStore().isOnline !== true) return false;
    let flushedAny = false;
    for (const entry of [...removalBuffer.value]) {
      try {
        await removeFavorite(entry.snapshot);
        removalBuffer.value = removalBuffer.value.filter((item) => item !== entry);
        flushedAny = true;
      } catch {
        // Оставляем запись: повторим при следующем коннекте.
      }
    }
    persistBuffer();
    return flushedAny;
  }

  /**
   * Коннект: буфер сортировки уходит на сервер по одному переносу.
   * Порядок важен (каждый следующий считается от предыдущего): первая
   * ошибка обрывает прогон, остаток ждёт следующего коннекта.
   */
  async function flushBufferedSort(): Promise<boolean> {
    if (!sortBuffer.value.length || useOnlineStore().isOnline !== true) return false;
    let flushedAny = false;
    for (const move of [...sortBuffer.value]) {
      try {
        await moveFavorite('track', { source_type: move.source_type, source_id: move.source_id }, move.to);
        sortBuffer.value = sortBuffer.value.filter((item) => item !== move);
        flushedAny = true;
      } catch {
        break;
      }
    }
    persistBuffer();
    return flushedAny;
  }

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
    // Неотправленные офлайн-удаления не даём ресинку воскресить:
    // сервер ещё не знает, буфер ещё не ушёл.
    if (removalBuffer.value.length) {
      for (const section of Object.values(sections)) {
        section.value = section.value.filter(
          (item) => !removalBuffer.value.some((entry) => sameIdentity(entry.snapshot, item)),
        );
      }
    }
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

  /**
   * Итог лайка: true — в избранном, false — нет, null — действие
   * подавлено (новый лайк в офлайне запрещён; optimizations.md).
   */
  async function toggle(snapshot: AnySnapshot): Promise<boolean | null> {
    if (has(snapshot)) {
      if (useOnlineStore().isOnline === false) {
        removeOffline(snapshot);
        usePlayerStore().noteWaveFavorite(snapshot, false);
        return false;
      }
      await remove(snapshot);
      usePlayerStore().noteWaveFavorite(snapshot, false);
      return false;
    }
    // Нет в избранном: офлайн — только отмена буферного удаления.
    if (useOnlineStore().isOnline === false) {
      if (cancelOfflineRemoval(snapshot)) return true;
      return null;
    }
    await add(snapshot);
    usePlayerStore().noteWaveFavorite(snapshot, true);
    return true;
  }

  /**
   * Drag&drop вкладки «Треки»: локально + PATCH /favorites/sort в форме
   * «один перенос» (api.md §10): бэк сдвигает только затронутый диапазон.
   * Офлайн перенос кладётся в буфер и уходит при коннекте (баг 21).
   * Ошибка онлайн-синка тихая — при следующей загрузке встанет серверный порядок.
   */
  function reorder(from: number, to: number) {
    if (from === to) return;
    const section = sections.track;
    const moved = section.value[from];
    if (!moved) return;
    const next = [...section.value];
    next.splice(from, 1);
    next.splice(to, 0, moved);
    section.value = next;
    persist();
    if (useOnlineStore().isOnline === false) {
      sortBuffer.value = [
        ...sortBuffer.value,
        { source_type: moved.source_type, source_id: moved.source_id, to },
      ].slice(-MAX_BUFFERED);
      persistBuffer();
      return;
    }
    void moveFavorite('track', { source_type: moved.source_type, source_id: moved.source_id }, to).catch(
      () => undefined,
    );
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
        if (bufferUserId !== userId) {
          bufferUserId = userId;
          void loadBuffer(userId);
        }
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
      if (!authed && (removalBuffer.value.length || sortBuffer.value.length || bufferUserId !== null)) {
        removalBuffer.value = [];
        sortBuffer.value = [];
        bufferUserId = null;
      }
    },
    { immediate: true },
  );

  // Коннект: буферы офлайн-правок уходят на сервер (сортировка — первой,
  // её переносы считаются от порядка, который видел пользователь), затем
  // одна конвергенция: серверное состояние перечитывается целиком.
  useOnlineStore().onOnline(() => {
    void (async () => {
      const sorted = await flushBufferedSort();
      const removed = await flushBufferedRemovals();
      if (sorted || removed) await fetchAll().catch(() => undefined);
    })();
  });

  return {
    tracks,
    videos,
    albums,
    artists,
    playlists,
    loaded,
    removalBuffer,
    has,
    add,
    remove,
    toggle,
    reorder,
    update,
    fetchAll,
  };
});
