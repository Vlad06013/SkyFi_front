import { defineStore } from 'pinia';
import { ref } from 'vue';
import { favoriteTracks } from '@/mocks/catalog';
import type { AnySnapshot, TrackSnapshot } from '@/types';

function sameIdentity(a: AnySnapshot, b: AnySnapshot) {
  return a.source_type === b.source_type && a.source_id === b.source_id;
}

export const useFavoritesStore = defineStore('favorites', () => {
  const tracks = ref<TrackSnapshot[]>([...favoriteTracks]);

  function has(snapshot: AnySnapshot | null | undefined) {
    if (!snapshot) return false;
    return tracks.value.some((track) => sameIdentity(track, snapshot));
  }

  function toggle(track: TrackSnapshot) {
    if (has(track)) {
      tracks.value = tracks.value.filter((item) => !sameIdentity(item, track));
      return false;
    }
    tracks.value = [...tracks.value, track];
    return true;
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...tracks.value];
    if (from < 0 || to < 0 || from >= next.length || to >= next.length) return;
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    tracks.value = next;
  }

  return { tracks, has, toggle, reorder };
});
