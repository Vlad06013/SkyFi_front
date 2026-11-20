import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import { fetchShareUrl } from '@/api/shares';
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

describe('api/shares', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('POST share-url: снапшот в теле → {url} публичной ссылки источника', async () => {
    postMock.mockResolvedValue({ url: 'https://music.yandex.ru/album/12345' } as never);
    const payload = await fetchShareUrl(track);
    expect(postMock).toHaveBeenCalledWith('share-url', track);
    expect(payload.url).toBe('https://music.yandex.ru/album/12345');
  });
});
