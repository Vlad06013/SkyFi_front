import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AnySnapshot, TrackSnapshot } from '@/types';

export type DownloadAllStatus = 'idle' | 'run' | 'done';

function keyOf(snapshot: AnySnapshot) {
  return `${snapshot.type}:${snapshot.source_type}:${snapshot.source_id}`;
}

/** Индекс скачанных треков + состояния «скачать всё» по вкладкам. */
export const useDownloadsStore = defineStore('downloads', () => {
  const items = ref<TrackSnapshot[]>([]);
  const allStatus = ref<Record<string, DownloadAllStatus>>({});
  const allPct = ref<Record<string, number>>({});
  const timers = new Map<string, ReturnType<typeof setInterval>>();

  const downloadedKeys = computed(() => new Set(items.value.map(keyOf)));

  function isDownloaded(snapshot: AnySnapshot) {
    return downloadedKeys.value.has(keyOf(snapshot));
  }

  function add(snapshot: AnySnapshot) {
    if (snapshot.type !== 'track' || isDownloaded(snapshot)) return false;
    items.value = [{ ...snapshot, type: 'track' }, ...items.value];
    return true;
  }

  function remove(snapshot: AnySnapshot) {
    items.value = items.value.filter((item) => keyOf(item) !== keyOf(snapshot));
  }

  function status(tab: string): DownloadAllStatus {
    return allStatus.value[tab] ?? 'idle';
  }

  function pct(tab: string) {
    return allPct.value[tab] ?? 0;
  }

  function downloadAll(tab: string, tracks: TrackSnapshot[]) {
    if (status(tab) !== 'idle') return;
    allStatus.value = { ...allStatus.value, [tab]: 'run' };
    allPct.value = { ...allPct.value, [tab]: 0 };
    const timer = setInterval(() => {
      const next = Math.min(100, (allPct.value[tab] ?? 0) + 5);
      allPct.value = { ...allPct.value, [tab]: next };
      if (next < 100) return;
      clearInterval(timer);
      timers.delete(tab);
      allStatus.value = { ...allStatus.value, [tab]: 'done' };
      tracks.forEach(add);
    }, 120);
    timers.set(tab, timer);
  }

  return { items, isDownloaded, add, remove, status, pct, downloadAll };
});
