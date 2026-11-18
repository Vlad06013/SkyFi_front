import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { favoriteTracks } from '@/mocks/catalog';
import { mockPlayerState } from '@/mocks/player';
import type { AnySnapshot, RepeatMode } from '@/types';

const repeatCycle: RepeatMode[] = ['off', 'all', 'one'];
const skipRestartAfter = 3;

export const usePlayerStore = defineStore('player', () => {
  const state = ref(mockPlayerState.state);
  const expanded = ref(false);
  const clipMode = ref(false);
  const clipQuality = ref(720);
  const clipQualities = [360, 720, 1080];
  const localDeviceId = ref(1);
  const volume = ref(72);
  const queue = ref<AnySnapshot[]>(
    favoriteTracks.filter((track) => track.source_id !== state.value.current_snapshot?.source_id),
  );

  function snapshotId(snapshot: AnySnapshot | null | undefined) {
    return snapshot && 'source_id' in snapshot ? snapshot.source_id : null;
  }

  function dropFromQueue(sourceId: string | null) {
    if (!sourceId) return;
    if (queue.value.some((track) => track.source_id === sourceId)) {
      queue.value = queue.value.filter((track) => track.source_id !== sourceId);
    }
  }

  function reorderQueue(from: number, to: number) {
    if (from === to) return;
    const next = [...queue.value];
    if (from < 0 || to < 0 || from >= next.length || to >= next.length) return;
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    queue.value = next;
  }

  const current = computed(() => state.value.current_snapshot);
  const title = computed(() => current.value?.title ?? '');
  const artist = computed(() =>
    current.value?.artists.map((a) => a.name).join(', ') ?? '',
  );
  function cycleInContext(delta: number) {
    const sourceId = snapshotId(current.value);
    const index = favoriteTracks.findIndex((track) => track.source_id === sourceId);
    const from = index < 0 ? 0 : index;
    return favoriteTracks[(from + delta + favoriteTracks.length) % favoriteTracks.length];
  }
  const previewNext = computed<AnySnapshot | null>(
    () => queue.value[0] ?? (favoriteTracks.length ? cycleInContext(1) : null),
  );
  const previewPrevious = computed<AnySnapshot | null>(
    () => (favoriteTracks.length ? cycleInContext(-1) : null),
  );
  const album = computed(() => {
    const snap = current.value;
    if (snap?.type === 'track') return snap.album?.title ?? '';
    return '';
  });
  const durationSeconds = computed(() => {
    const snap = current.value;
    if (snap && (snap.type === 'track' || snap.type === 'video')) {
      return (snap.duration_ms ?? 0) / 1000;
    }
    return 0;
  });
  const progress = computed(() => {
    const duration = durationSeconds.value;
    if (!duration) return 0;
    return Math.min(100, (state.value.position_seconds / duration) * 100);
  });

  function togglePlay() {
    state.value = { ...state.value, is_playing: !state.value.is_playing };
  }

  function toggleShuffle() {
    state.value = { ...state.value, shuffle_enabled: !state.value.shuffle_enabled };
  }

  function toggleRepeat() {
    const index = repeatCycle.indexOf(state.value.repeat_mode);
    state.value = {
      ...state.value,
      repeat_mode: repeatCycle[(index + 1) % repeatCycle.length],
    };
  }

  function playSnapshot(snapshot: AnySnapshot) {
    dropFromQueue(snapshotId(snapshot));
    state.value = {
      ...state.value,
      current_snapshot: snapshot,
      position_seconds: 0,
      is_playing: true,
      play_source: snapshot.type === 'track' ? 'single' : state.value.play_source,
    };
  }

  function skipBy(delta: number) {
    if (delta > 0 && queue.value.length) {
      playSnapshot(queue.value[0]);
      return;
    }
    const tracks = favoriteTracks;
    if (!tracks.length) return;
    const sourceId = snapshotId(current.value);
    const index = tracks.findIndex((track) => track.source_id === sourceId);
    const from = index < 0 ? 0 : index;
    const next = tracks[(from + delta + tracks.length) % tracks.length];
    state.value = {
      ...state.value,
      current_snapshot: next,
      position_seconds: 0,
      is_playing: true,
    };
  }

  function skipNext() {
    skipBy(1);
  }

  function skipPrevious() {
    if (state.value.position_seconds > skipRestartAfter) {
      state.value = { ...state.value, position_seconds: 0 };
      return;
    }
    skipBy(-1);
  }

  function seek(seconds: number) {
    const max = durationSeconds.value;
    if (!max) return;
    state.value = {
      ...state.value,
      position_seconds: Math.min(max, Math.max(0, seconds)),
    };
  }

  function seekRatio(ratio: number) {
    seek(ratio * durationSeconds.value);
  }

  function toggleClips() {
    clipMode.value = !clipMode.value;
  }

  function setClipQuality(quality: number) {
    clipQuality.value = quality;
  }

  function activateDevice(id: number) {
    state.value = {
      ...state.value,
      active_device_id: id,
      devices: state.value.devices.map((device) => ({
        ...device,
        is_active: device.id === id,
      })),
    };
  }

  function openExpanded() {
    if (current.value) expanded.value = true;
  }

  function closeExpanded() {
    expanded.value = false;
  }

  function setVolume(percent: number) {
    volume.value = Math.round(Math.min(100, Math.max(0, percent)));
  }

  return {
    state,
    expanded,
    clipMode,
    clipQuality,
    clipQualities,
    localDeviceId,
    volume,
    queue,
    current,
    title,
    artist,
    previewNext,
    previewPrevious,
    album,
    durationSeconds,
    progress,
    togglePlay,
    toggleShuffle,
    toggleRepeat,
    playSnapshot,
    reorderQueue,
    skipNext,
    skipPrevious,
    seek,
    seekRatio,
    toggleClips,
    setClipQuality,
    activateDevice,
    openExpanded,
    closeExpanded,
    setVolume,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePlayerStore, import.meta.hot));
}
