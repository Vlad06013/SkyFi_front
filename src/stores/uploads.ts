import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { deleteUpload, fetchUploads, updateUpload, uploadTrack } from '@/api/uploads';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import type { TrackSnapshot, UploadPatch } from '@/types';

export const useUploadsStore = defineStore('uploads', () => {
  const items = ref<TrackSnapshot[]>([]);

  /** Список загружен с сервера хотя бы раз. */
  const loaded = ref(false);

  async function fetchAll() {
    items.value = await fetchUploads();
    loaded.value = true;
  }

  /** Файл + мета; итоговый снапшот с сервера встаёт в начало списка. */
  async function add(
    file: File,
    meta: { title: string; artistNames: string[]; albumTitle?: string },
  ) {
    const snapshot = await uploadTrack(file, meta);
    items.value = [snapshot, ...items.value.filter((item) => item.source_id !== snapshot.source_id)];
  }

  function applyPatch(snapshot: TrackSnapshot, patch: UploadPatch): TrackSnapshot {
    return {
      ...snapshot,
      title: patch.title ?? snapshot.title,
      artists: patch.artist_names
        ? patch.artist_names.map((name) => ({ name }))
        : snapshot.artists,
      album:
        patch.album_title !== undefined
          ? { ...snapshot.album, title: patch.album_title }
          : snapshot.album,
      visibility: patch.visibility ?? snapshot.visibility,
    };
  }

  /** Оптимистичная правка меты; при ошибке — перечитать список с сервера. */
  async function update(id: string, patch: UploadPatch) {
    const previous = items.value;
    items.value = items.value.map((item) => (item.source_id === id ? applyPatch(item, patch) : item));
    try {
      const snapshot = await updateUpload(id, patch);
      items.value = items.value.map((item) => (item.source_id === id ? snapshot : item));
    } catch (error) {
      items.value = previous;
      throw error;
    }
  }

  /** Оптимистичное удаление с откатом, как лайки в избранном. */
  async function remove(id: string) {
    const previous = items.value;
    const index = items.value.findIndex((item) => item.source_id === id);
    if (index === -1) return;
    items.value = items.value.filter((item) => item.source_id !== id);
    try {
      await deleteUpload(id);
    } catch (error) {
      items.value = previous;
      throw error;
    }
  }

  // Автозагрузка: вход/восстановление сессии + возврат онлайна.
  // Выход чистит чужие данные — один стор решает, когда список актуален.
  const auth = useAuthStore();
  watch(
    () => [auth.isAuthed, useOnlineStore().isOnline] as const,
    ([authed, online]) => {
      if (authed && online && !loaded.value) {
        void fetchAll().catch(() => undefined);
      }
      if (!authed && loaded.value) {
        items.value = [];
        loaded.value = false;
      }
    },
    { immediate: true },
  );

  return { items, loaded, fetchAll, add, update, remove };
});
