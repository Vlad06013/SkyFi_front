import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { deleteUpload, fetchUploads, updateUpload, uploadTrack } from '@/api/uploads';
import { clearUploadsCache, loadUploadsCache, saveUploadsCache } from '@/lib/library-cache';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import type { TrackSnapshot, UploadPatch } from '@/types';

export const useUploadsStore = defineStore('uploads', () => {
  const items = ref<TrackSnapshot[]>([]);

  /** Список загружен с сервера хотя бы раз. */
  const loaded = ref(false);

  /** Последнее состояние списка — в базу текущего пользователя (офлайн-витрина). */
  function persist() {
    const userId = useAuthStore().user?.id;
    if (!userId) return;
    void saveUploadsCache(userId, items.value);
  }

  async function fetchAll() {
    items.value = await fetchUploads();
    loaded.value = true;
    persist();
  }

  /** Файл + мета; итоговый снапшот с сервера встаёт в начало списка. */
  async function add(
    file: File,
    meta: { title: string; artistNames: string[]; albumTitle?: string; lyrics?: string },
    onProgress?: (ratio: number) => void,
  ) {
    const snapshot = await uploadTrack(file, meta, onProgress);
    items.value = [snapshot, ...items.value.filter((item) => item.source_id !== snapshot.source_id)];
    persist();
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
      persist();
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
      persist();
    } catch (error) {
      items.value = previous;
      throw error;
    }
  }

  // Автозагрузка: кеш из базы сразу (офлайн-витрина, как у избранного),
  // сервер — когда есть сеть. Выход чистит чужие данные.
  const auth = useAuthStore();
  watch(
    () => [auth.isAuthed, auth.user?.id ?? null, useOnlineStore().isOnline] as const,
    ([authed, userId, online]) => {
      if (authed && userId && !loaded.value) {
        void loadUploadsCache(userId).then((cached) => {
          if (!cached || loaded.value || useAuthStore().user?.id !== userId) return;
          items.value = cached;
        });
      }
      if (authed && online && !loaded.value) {
        void fetchAll().catch(() => undefined);
      }
      if (!authed && (loaded.value || items.value.length)) {
        items.value = [];
        loaded.value = false;
        void clearUploadsCache();
      }
    },
    { immediate: true },
  );

  return { items, loaded, fetchAll, add, update, remove };
});
