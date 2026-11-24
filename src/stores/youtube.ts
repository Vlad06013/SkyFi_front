import { defineStore } from 'pinia';
import { ref } from 'vue';
import { deleteYoutubeCookies, fetchYoutubeCookiesStatus, uploadYoutubeCookies } from '@/api/videos';

export const useYoutubeStore = defineStore('youtube', () => {
  /** null — первого refresh ещё не было. */
  const hasCookies = ref<boolean | null>(null);
  const updatedAt = ref<string | null>(null);
  /** upload/delete в полёте. */
  const busy = ref(false);

  /** Ошибку пробрасываем — карточка решает сама (loadFailed/тост). */
  async function refresh() {
    const payload = await fetchYoutubeCookiesStatus();
    hasCookies.value = payload.has_cookies;
    updatedAt.value = payload.updated_at;
  }

  async function upload(file: File) {
    if (busy.value) return;
    busy.value = true;
    try {
      await uploadYoutubeCookies(file);
      await refresh();
    } finally {
      busy.value = false;
    }
  }

  async function remove() {
    if (busy.value) return;
    busy.value = true;
    try {
      await deleteYoutubeCookies();
    } finally {
      busy.value = false;
    }
    hasCookies.value = false;
    updatedAt.value = null;
  }

  return { hasCookies, updatedAt, busy, refresh, upload, remove };
});
