import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { checkHealth } from '@/api/health';
import { useOnlineStore } from '@/stores/online';

vi.mock('@/api/health', () => ({
  checkHealth: vi.fn(),
}));

const checkHealthMock = vi.mocked(checkHealth);

describe('stores/online', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  it('первая проверка сразу, далее раз в 10 с', async () => {
    checkHealthMock.mockResolvedValue(true);
    const online = useOnlineStore();

    await online.startPolling();
    expect(online.isOnline).toBe(true);
    expect(checkHealthMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(checkHealthMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(checkHealthMock).toHaveBeenCalledTimes(3);
    await online.stopPolling();
  });

  it('сбой → offline, после восстановления снова online', async () => {
    checkHealthMock.mockRejectedValueOnce(new Error('down'));
    const online = useOnlineStore();

    await online.startPolling();
    expect(online.isOnline).toBe(false);

    checkHealthMock.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(online.isOnline).toBe(true);
    await online.stopPolling();
  });

  it('stopPolling останавливает тиканье', async () => {
    checkHealthMock.mockResolvedValue(true);
    const online = useOnlineStore();

    await online.startPolling();
    await online.stopPolling();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(checkHealthMock).toHaveBeenCalledTimes(1);
  });
});
