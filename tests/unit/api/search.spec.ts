import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import { fetchSearch, fetchSearchV2 } from '@/api/search';

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
  },
}));

const getMock = vi.mocked(http.get);

describe('api/search', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('передаёт q/limit/page параметрами запроса', async () => {
    getMock.mockResolvedValue({ query: 'sum 41', page: 2, best: null } as never);
    await fetchSearch({ q: 'sum 41', limit: 20, page: 2 });
    expect(getMock).toHaveBeenCalledWith('search', { params: { q: 'sum 41', limit: 20, page: 2 } });
  });

  it('без limit/page — уходит только q', async () => {
    getMock.mockResolvedValue(null as never);
    await fetchSearch({ q: 'би-2' });
    expect(getMock).toHaveBeenCalledWith('search', { params: { q: 'би-2' } });
  });

  it('v2 шлёт resource, type и section на /search/v2', async () => {
    getMock.mockResolvedValue(null as never);
    await fetchSearchV2({ q: 'sum 41', resource: 'youtube', type: 'video', section: 'videos', page: 1, limit: 20 });
    expect(getMock).toHaveBeenCalledWith('search/v2', {
      params: { q: 'sum 41', resource: 'youtube', type: 'video', section: 'videos', page: 1, limit: 20 },
    });
  });
});
