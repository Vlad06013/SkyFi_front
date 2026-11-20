import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import * as queueApi from '@/api/queue';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type { QueueItem, TrackSnapshot } from '@/types';

vi.mock('@/api/queue', () => ({
  fetchQueue: vi.fn(),
  addToQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderPending: vi.fn(),
}));

const fetchQueueMock = vi.mocked(queueApi.fetchQueue);
const addToQueueMock = vi.mocked(queueApi.addToQueue);
const removeFromQueueMock = vi.mocked(queueApi.removeFromQueue);
const reorderPendingMock = vi.mocked(queueApi.reorderPending);

const track: TrackSnapshot = {
  type: 'track',
  source_type: 'yandex_music',
  source_id: 't1',
  title: 'радиотишина',
  artists: [{ name: 'завтра' }],
  duration_ms: 200000,
  cover_url: null,
  album: null,
  stream_url: null,
};

function makeItem(id: number, position: number, snapshot: TrackSnapshot | null = track): QueueItem {
  return {
    id,
    player_state_id: 1,
    added_by_user_id: null,
    position,
    status: 'pending',
    snapshot,
  };
}

describe('stores/player: очередь', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fetchQueueMock.mockReset();
    addToQueueMock.mockReset();
    removeFromQueueMock.mockReset();
    reorderPendingMock.mockReset();
  });

  it('ensureQueue: грузит один раз и сортирует по position', async () => {
    fetchQueueMock.mockResolvedValue([makeItem(2, 2), makeItem(1, 1)] as never);
    const player = usePlayerStore();

    await player.ensureQueue();
    await player.ensureQueue();

    expect(fetchQueueMock).toHaveBeenCalledTimes(1);
    expect(player.queue.map((item) => item.id)).toEqual([1, 2]);
  });

  it('ensureQueue: при ошибке флажок сбрасывается — следующий вызов пробует снова', async () => {
    fetchQueueMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([] as never);
    const player = usePlayerStore();

    await player.ensureQueue();
    await player.ensureQueue();

    expect(fetchQueueMock).toHaveBeenCalledTimes(2);
    expect(player.queue).toEqual([]);
  });

  it('enqueueSnapshot: постит снапшот, очередь из ответа', async () => {
    addToQueueMock.mockResolvedValue([makeItem(5, 1)] as never);
    const player = usePlayerStore();

    const added = await player.enqueueSnapshot(track);

    expect(added).toBe(true);
    expect(addToQueueMock).toHaveBeenCalledWith(track);
    expect(player.queue.map((item) => item.id)).toEqual([5]);
  });

  it('enqueueSnapshot: ошибка — тост, очередь не тронута, false', async () => {
    addToQueueMock.mockRejectedValue(new Error('Слишком часто. Подождите.'));
    const player = usePlayerStore();
    const toast = useToastStore();

    const added = await player.enqueueSnapshot(track);

    expect(added).toBe(false);
    expect(player.queue).toEqual([]);
    expect(toast.toast?.error).toBe(true);
  });

  it('removeQueueItem: удаляет и подставляет серверную очередь', async () => {
    removeFromQueueMock.mockResolvedValue([makeItem(2, 1)] as never);
    const player = usePlayerStore();

    await player.removeQueueItem(1);

    expect(removeFromQueueMock).toHaveBeenCalledWith(1);
    expect(player.queue.map((item) => item.id)).toEqual([2]);
  });

  it('reorderQueue: шлёт id ожидающих в новом порядке', async () => {
    fetchQueueMock.mockResolvedValue([makeItem(1, 1), makeItem(2, 2), makeItem(3, 3)] as never);
    reorderPendingMock.mockResolvedValue([makeItem(3, 1), makeItem(1, 2), makeItem(2, 3)] as never);
    const player = usePlayerStore();
    await player.ensureQueue();

    await player.reorderQueue(0, 2);

    expect(reorderPendingMock).toHaveBeenCalledWith([2, 3, 1]);
    expect(player.queue.map((item) => item.id)).toEqual([3, 1, 2]);
  });

  it('reorderQueue: from === to — запроса нет', async () => {
    const player = usePlayerStore();
    await player.reorderQueue(1, 1);
    expect(reorderPendingMock).not.toHaveBeenCalled();
  });

  it('previewNext: первый элемент очереди', async () => {
    fetchQueueMock.mockResolvedValue([makeItem(1, 1), makeItem(2, 2)] as never);
    const player = usePlayerStore();
    await player.ensureQueue();

    expect(player.previewNext?.source_id).toBe('t1');
  });
});
