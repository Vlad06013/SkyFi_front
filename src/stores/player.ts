import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { addToQueue, fetchQueue, removeFromQueue, reorderPending } from '@/api/queue';
import { moveItem } from '@/lib/list-sort';
import { favoriteTracks } from '@/mocks/catalog';
import { mockPlayerState } from '@/mocks/player';
import { useToastStore } from '@/stores/toast';
import type { AnySnapshot, QueueItem, RepeatMode } from '@/types';

const repeatCycle: RepeatMode[] = ['off', 'all', 'one'];
const skipRestartAfter = 3;

export const usePlayerStore = defineStore('player', () => {
  const toast = useToastStore();
  const state = ref(mockPlayerState.state);
  const expanded = ref(false);
  const clipMode = ref(false);
  const clipQuality = ref(720);
  const clipQualities = [360, 720, 1080];
  const volume = ref(72);
  /** Серверная очередь — источник истины (api.md §6); статусы пока не используем. */
  const queue = ref<QueueItem[]>([]);
  /** Первичная загрузка очереди прошла (неудача сбрасывает флажок — повторим при следующем открытии). */
  const queueLoaded = ref(false);

  function sortQueue(items: QueueItem[]): QueueItem[] {
    return [...items].sort((a, b) => a.position - b.position);
  }

  /** Ленивый первичный GET очереди: стор живёт и без авторизации, поэтому не в конструкторе. */
  async function ensureQueue() {
    if (queueLoaded.value) return;
    await refreshQueue();
  }

  /** Форс-рефетч очереди (сокеты playback.queue.updated / friend.queue.item.added). */
  async function refreshQueue() {
    try {
      queue.value = sortQueue(await fetchQueue());
      queueLoaded.value = true;
    } catch {
      /* очередь догрузится при следующем открытии */
    }
  }

  /** Добавление в конец очереди. true — сервер принял. */
  async function enqueueSnapshot(snapshot: AnySnapshot): Promise<boolean> {
    try {
      queue.value = sortQueue(await addToQueue(snapshot));
      return true;
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : 'Не удалось добавить в очередь', '', true);
      return false;
    }
  }

  async function removeQueueItem(id: number) {
    try {
      queue.value = sortQueue(await removeFromQueue(id));
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : 'Не удалось убрать из очереди', '', true);
    }
  }

  /** Перестановка по индексам: бэку уходит список id ожидающих в новом порядке. */
  async function reorderQueue(from: number, to: number) {
    if (from === to) return;
    const items = moveItem(queue.value, from, to).map((item) => item.id);
    try {
      queue.value = sortQueue(await reorderPending(items));
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : 'Не удалось изменить порядок', '', true);
    }
  }

  function snapshotId(snapshot: AnySnapshot | null | undefined) {
    return snapshot && 'source_id' in snapshot ? snapshot.source_id : null;
  }

  function dropFromQueue(sourceId: string | null) {
    if (!sourceId) return;
    if (queue.value.some((item) => item.snapshot?.source_id === sourceId)) {
      queue.value = queue.value.filter((item) => item.snapshot?.source_id !== sourceId);
    }
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
    () => queue.value[0]?.snapshot ?? (favoriteTracks.length ? cycleInContext(1) : null),
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
      const next = queue.value[0]?.snapshot;
      if (next) playSnapshot(next);
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

  function syncClipMode() {
    if (current.value?.type === 'video') clipMode.value = true;
  }

  watch(() => current.value?.type, syncClipMode);

  function openExpanded() {
    syncClipMode();
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
    volume,
    queue,
    queueLoaded,
    current,
    title,
    artist,
    previewNext,
    previewPrevious,
    skipRestartAfter,
    album,
    durationSeconds,
    progress,
    togglePlay,
    toggleShuffle,
    toggleRepeat,
    playSnapshot,
    ensureQueue,
    refreshQueue,
    enqueueSnapshot,
    removeQueueItem,
    reorderQueue,
    skipNext,
    skipPrevious,
    seek,
    seekRatio,
    toggleClips,
    setClipQuality,
    openExpanded,
    closeExpanded,
    setVolume,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePlayerStore, import.meta.hot));
}
