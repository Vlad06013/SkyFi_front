import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import {
  cancelYandexImport,
  disconnectYandex,
  fetchYandexDeviceStatus,
  fetchYandexImportProgress,
  fetchYandexImportSummary,
  startYandexDeviceAuth,
  startYandexImport,
} from '@/api/yandex';

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const getMock = vi.mocked(http.get);
const postMock = vi.mocked(http.post);
const deleteMock = vi.mocked(http.delete);

describe('api/yandex', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
  });

  it('start: POST yandex-music/auth/device/start без тела', async () => {
    const payload = { session_id: 's1', status: 'pending', verification_url: 'https://ya.ru/device', user_code: 'abc123' };
    postMock.mockResolvedValue(payload);
    await expect(startYandexDeviceAuth()).resolves.toEqual(payload);
    expect(postMock).toHaveBeenCalledWith('yandex-music/auth/device/start');
  });

  it('status: GET yandex-music/auth/device/status', async () => {
    getMock.mockResolvedValue({ status: 'not_started', connected: false });
    await fetchYandexDeviceStatus();
    expect(getMock).toHaveBeenCalledWith('yandex-music/auth/device/status');
  });

  it('disconnect: DELETE yandex-music/auth', async () => {
    deleteMock.mockResolvedValue({ connected: false, message: 'Яндекс Музыка отключена.' });
    await disconnectYandex();
    expect(deleteMock).toHaveBeenCalledWith('yandex-music/auth');
  });

  it('summary: GET import/yandex-music/summary', async () => {
    const payload = {
      tracks: { total: 10, existing: 2 },
      videos: { total: 0, existing: 0 },
      albums: { total: 3, existing: 0 },
      playlists: { total: 1, existing: 1 },
      artists: { total: 5, existing: 0 },
    };
    getMock.mockResolvedValue(payload);
    await expect(fetchYandexImportSummary()).resolves.toEqual(payload);
    expect(getMock).toHaveBeenCalledWith('import/yandex-music/summary');
  });

  it('startImport: POST import/yandex-music', async () => {
    const payload = { job_id: 'j1', status: 'queued', total: 0, processed: 0, imported: 0, skipped: 0, failed: 0, progress: 0, message: null, started_at: null, finished_at: null };
    postMock.mockResolvedValue(payload);
    await expect(startYandexImport()).resolves.toEqual(payload);
    expect(postMock).toHaveBeenCalledWith('import/yandex-music');
  });

  it('progress: GET import/yandex-music', async () => {
    getMock.mockResolvedValue(null);
    await fetchYandexImportProgress();
    expect(getMock).toHaveBeenCalledWith('import/yandex-music');
  });

  it('cancel: DELETE import/yandex-music', async () => {
    deleteMock.mockResolvedValue({ job_id: 'j1', status: 'cancelled', total: 10, processed: 4, imported: 4, skipped: 0, failed: 0, progress: 40, message: 'Импорт отменён', started_at: 't', finished_at: 't' });
    await cancelYandexImport();
    expect(deleteMock).toHaveBeenCalledWith('import/yandex-music');
  });
});
