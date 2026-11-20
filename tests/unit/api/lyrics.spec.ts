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
    postMock.mockResolvedValue(null);
    await fetchLyrics(track);
    expect(postMock).toHaveBeenCalledWith('audio/lyrics', track);
  });

  it('ответ — строки текста напрямую (api.md §7), не объект', async () => {
    const lines = [{ text: 'строка', time_ms: 1200 }];
    postMock.mockResolvedValue(lines);
    await expect(fetchLyrics(track)).resolves.toEqual(lines);
  });
});
