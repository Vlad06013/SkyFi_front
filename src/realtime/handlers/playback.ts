import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type {
  PlaybackQueueUpdatedPayload,
  PlaybackStateUpdatedPayload,
  WaveUpdatedPayload,
} from '@/types/realtime';

/** playback.state.updated (api.md §17): state+queue целиком, version-gate в сторе. */
export function handlePlaybackStateUpdated(payload: PlaybackStateUpdatedPayload) {
  if (!payload?.state) return;
  usePlayerStore().applySocketState({ state: payload.state, queue: payload.queue ?? [] });
}

/** playback.queue.updated (api.md §17): add (item заполнен — тост «добавлено»), remove/reorder (null). */
export function handlePlaybackQueueUpdated(payload: PlaybackQueueUpdatedPayload) {
  const player = usePlayerStore();
  if (payload?.item) {
    const artists = payload.item.artists.join(', ');
    useToastStore().show(payload.item.title, artists ? `${artists} · добавлено в очередь` : 'добавлено в очередь');
  }
  void player.refreshQueue();
}

/** playback.wave.updated (api.md §17): окно выросло — заменяем копию, трек не трогаем. */
export function handleWaveUpdated(payload: WaveUpdatedPayload) {
  if (!payload) return;
  usePlayerStore().invalidateWave();
}
