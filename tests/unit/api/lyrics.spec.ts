import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import { fetchLyrics } from '@/api/lyrics';
import type { TrackSnapshot } from '@/types';

vi.mock('@/api/http', () => ({
  http: {
    post: vi.fn(),
  },
}));

const postMock = vi.mocked(http.post);

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

describe('api/lyrics', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('POST audio/lyrics с track-снапшотом в теле', async () => {
    postMock.mockResolvedValue({ lyrics: null } as never);
    await fetchLyrics(track);
    expect(postMock).toHaveBeenCalledWith('audio/lyrics', track);
  });
});
