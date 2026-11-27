import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import { fetchQueue, addToQueue, removeFromQueue, movePending } from '@/api/queue';
import type { QueueItem, TrackSnapshot } from '@/types';

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

const getMock = vi.mocked(http.get);
const postMock = vi.mocked(http.post);
const deleteMock = vi.mocked(http.delete);
const patchMock = vi.mocked(http.patch);

const track: TrackSnapshot = {
  type: 'track',
  source_type: 'yandex_music',
  source_id: '12345',
  title: 'радиотишина',
  artists: [{ name: 'завтра' }],
  duration_ms: 200000,
  cover_url: null,
  album: null,
  stream_url: null,
};

function makeItem(id: number, position: number): QueueItem {
  return {
    id,
    player_state_id: 1,
    added_by_user_id: null,
    position,
    status: 'pending',
    snapshot: track,
  };
}

describe('api/queue', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    patchMock.mockReset();
  });

  it('GET player/queue', async () => {
    getMock.mockResolvedValue([] as never);
    await fetchQueue();
    expect(getMock).toHaveBeenCalledWith('player/queue');
  });

  it('POST player/queue: снапшот в теле', async () => {
    postMock.mockResolvedValue([] as never);
    await addToQueue(track);
    expect(postMock).toHaveBeenCalledWith('player/queue', track);
  });

  it('DELETE player/queue/{id}', async () => {
    deleteMock.mockResolvedValue([] as never);
    await removeFromQueue(7);
    expect(deleteMock).toHaveBeenCalledWith('player/queue/7');
  });

  it('PATCH player/queue/reorder: перенос одного элемента на позицию', async () => {
    patchMock.mockResolvedValue([makeItem(3, 1), makeItem(1, 2)] as never);
    const result = await movePending(3, 0);
    expect(patchMock).toHaveBeenCalledWith('player/queue/reorder', { item: 3, to_index: 0 });
    expect(result).toHaveLength(2);
  });
});
