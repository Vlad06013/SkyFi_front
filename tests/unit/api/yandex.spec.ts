import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import { disconnectYandex, fetchYandexDeviceStatus, startYandexDeviceAuth } from '@/api/yandex';

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
});
