import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import { fetchEntityDetails } from '@/api/details';

vi.mock('@/api/http', () => ({
  http: {
    post: vi.fn(),
  },
}));

const postMock = vi.mocked(http.post);

describe('api/details', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('POST details: конверт снапшота + пагинация в теле', async () => {
    postMock.mockResolvedValue({ entity: null } as never);
    await fetchEntityDetails(
      { type: 'album', source_type: 'yandex_music', source_id: '43334443' },
      { page: 2, limit: 50 },
    );
    expect(postMock).toHaveBeenCalledWith(
      'details',
      {
        type: 'album',
        source_type: 'yandex_music',
        source_id: '43334443',
        page: 2,
        limit: 50,
      },
      undefined,
    );
  });

  it('без params — только конверт', async () => {
    postMock.mockResolvedValue({ entity: null } as never);
    await fetchEntityDetails({ type: 'artist', source_type: 'yandex_music', source_id: '6964' });
    expect(postMock).toHaveBeenCalledWith(
      'details',
      {
        type: 'artist',
        source_type: 'yandex_music',
        source_id: '6964',
      },
      undefined,
    );
  });
});
