import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, http } from '@/api/http';
import { checkHealth, probeHealth, HEALTH_TIMEOUT_MS } from '@/api/health';

vi.mock('@/api/http', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  http: {
    get: vi.fn(),
  },
}));

const getMock = vi.mocked(http.get);

describe('api/health', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('true на осмысленный 200', async () => {
    getMock.mockResolvedValue({ status: 'ok', server_time: 't' });
    await expect(checkHealth()).resolves.toBe(true);
  });

  it('передаёт таймаут 10 с', async () => {
    getMock.mockResolvedValue({ status: 'ok', server_time: 't' });
    await checkHealth();
    expect(getMock).toHaveBeenCalledWith('health', { timeout: HEALTH_TIMEOUT_MS });
    expect(HEALTH_TIMEOUT_MS).toBe(15_000);
  });

  it('false на 200 без status ok', async () => {
    getMock.mockResolvedValue({ status: 'weird', server_time: 't' });
    await expect(checkHealth()).resolves.toBe(false);
  });

  it('false на любой сбой (таймаут/сеть/5xx)', async () => {
    getMock.mockRejectedValue(new Error('timeout'));
    await expect(checkHealth()).resolves.toBe(false);
  });

  it('probeHealth: таймаут отличаем от обрыва по коду axios в ApiError', async () => {
    getMock.mockRejectedValue(new ApiError(null, 'network', 'Нет соединения.', undefined, 'ECONNABORTED'));
    const timeout = await probeHealth();
    expect(timeout).toMatchObject({ ok: false, miss: 'timeout', detail: 'Нет соединения.' });

    getMock.mockRejectedValue(new ApiError(null, 'network', 'Нет соединения.', undefined, 'ERR_NETWORK'));
    const reset = await probeHealth();
    expect(reset).toMatchObject({ ok: false, miss: 'network' });
  });

  it('probeHealth: HTTP-статус и странное тело — свои типы промаха', async () => {
    getMock.mockRejectedValue(new ApiError(502, 'server', 'Сервер недоступен. Попробуйте позже.'));
    expect(await probeHealth()).toMatchObject({ ok: false, miss: 'http', detail: 'HTTP 502' });

    getMock.mockResolvedValue({ status: 'weird', server_time: 't' });
    expect(await probeHealth()).toMatchObject({ ok: false, miss: 'payload', detail: 'status=weird' });
  });
});
