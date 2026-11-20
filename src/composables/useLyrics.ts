import { computed, ref, watch } from 'vue';
import { fetchLyrics, type LyricsLine } from '@/api/lyrics';
import type { TrackSnapshot } from '@/types';

/**
 * Текст песни для now-playing (api.md §7, POST /audio/lyrics —
 * ответ: строки текста или null). Запрос уходит при открытом слое
 * lyrics и при смене трека внутри него (generation-защита от гонок,
 * как в useEntityDetails). `time_ms` может отсутствовать — тогда
 * synced=false и подсветка активной строки не используется.
 */
export function useLyrics(
  getTrack: () => TrackSnapshot | null,
  getActive: () => boolean,
) {
  const lines = ref<LyricsLine[] | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  let generation = 0;
  let loadedFor: string | null = null;

  async function load() {
    const track = getTrack();
    if (!getActive() || !track) return;
    if (loadedFor === track.source_id && !error.value) return;
    const gen = ++generation;
    loading.value = true;
    error.value = null;
    lines.value = null;
    try {
      const result = await fetchLyrics(track);
      if (gen !== generation) return;
      lines.value = result && result.length > 0 ? result : null;
      loadedFor = track.source_id;
    } catch {
      if (gen !== generation) return;
      lines.value = null;
      error.value = 'Не удалось загрузить текст';
    } finally {
      if (gen === generation) loading.value = false;
    }
  }

  function retry() {
    loadedFor = null;
    void load();
  }

  /** Синхронный текст: таймкоды есть у всех строк. */
  const synced = computed(() => Boolean(
    lines.value?.length && lines.value.every((line) => line.time_ms !== null),
  ));

  watch(
    () => (getActive() ? getTrack()?.source_id : null),
    () => void load(),
  );

  return { lines, loading, error, synced, retry };
}
