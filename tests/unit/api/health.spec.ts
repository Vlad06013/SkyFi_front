import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import { checkHealth, HEALTH_TIMEOUT_MS } from '@/api/health';

vi.mock('@/api/http', () => ({
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

  it('передаёт таймаут 5 с', async () => {
    getMock.mockResolvedValue({ status: 'ok', server_time: 't' });
    await checkHealth();
    expect(getMock).toHaveBeenCalledWith('health', { timeout: HEALTH_TIMEOUT_MS });
    expect(HEALTH_TIMEOUT_MS).toBe(5_000);
  });

  it('false на 200 без status ok', async () => {
    getMock.mockResolvedValue({ status: 'weird', server_time: 't' });
    await expect(checkHealth()).resolves.toBe(false);
  });

  it('false на любой сбой (таймаут/сеть/5xx)', async () => {
    getMock.mockRejectedValue(new Error('timeout'));
    await expect(checkHealth()).resolves.toBe(false);
  });
});
