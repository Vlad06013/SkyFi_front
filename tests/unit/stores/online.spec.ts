import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { probeHealth } from '@/api/health';
import { clearHealthLog, healthLog } from '@/lib/health-log';
import { useOnlineStore } from '@/stores/online';

vi.mock('@/api/health', () => ({
  probeHealth: vi.fn(),
  HEALTH_TIMEOUT_MS: 10_000,
}));

const probeHealthMock = vi.mocked(probeHealth);

const okProbe = { ok: true, durationMs: 5, miss: null, detail: '' } as const;
const missProbe = { ok: false, durationMs: 10_000, miss: 'timeout', detail: 'timeout of 10000ms exceeded' } as const;

describe('stores/online', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    clearHealthLog();
    vi.useFakeTimers();
  });

  it('первая проверка сразу, далее раз в 10 с', async () => {
    probeHealthMock.mockResolvedValue(okProbe);
    const online = useOnlineStore();

    await online.startPolling();
    expect(online.isOnline).toBe(true);
    expect(probeHealthMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(probeHealthMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(probeHealthMock).toHaveBeenCalledTimes(3);
    await online.stopPolling();
  });

  it('сбой → offline, после восстановления снова online', async () => {
    probeHealthMock.mockRejectedValueOnce(new Error('down'));
    const online = useOnlineStore();

    await online.startPolling();
    expect(online.isOnline).toBe(false);

    probeHealthMock.mockResolvedValue(okProbe);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(online.isOnline).toBe(true);
    await online.stopPolling();
  });

  it('одиночный таймаут не уводит в офлайн — только два подряд', async () => {
    probeHealthMock.mockResolvedValue(okProbe);
    const online = useOnlineStore();

    await online.startPolling();
    expect(online.isOnline).toBe(true);

    // Один промах (холодный LTE-зонд) — состояние держим.
    probeHealthMock.mockResolvedValueOnce(missProbe);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(online.isOnline).toBe(true);

    // Второй подряд — уходим в офлайн.
    probeHealthMock.mockResolvedValueOnce(missProbe);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(online.isOnline).toBe(false);

    // Один успех возвращает онлайн сразу, без серии.
    probeHealthMock.mockResolvedValue(okProbe);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(online.isOnline).toBe(true);
    await online.stopPolling();
  });

  it('stopPolling останавливает тиканье', async () => {
    probeHealthMock.mockResolvedValue(okProbe);
    const online = useOnlineStore();

    await online.startPolling();
    await online.stopPolling();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(probeHealthMock).toHaveBeenCalledTimes(1);
  });

  it('журнал: промах пишется с типом, длительностью и переходом в офлайн', async () => {
    probeHealthMock.mockResolvedValue(missProbe);
    const online = useOnlineStore();

    await online.startPolling();
    expect(healthLog.value).toHaveLength(1);
    expect(healthLog.value[0]).toMatchObject({
      ok: false,
      miss: 'timeout',
      durationMs: 10_000,
      transition: 'offline',
    });

    // Повторный промах — запись есть, перехода уже нет (офлайн держится).
    await vi.advanceTimersByTimeAsync(10_000);
    expect(healthLog.value).toHaveLength(2);
    expect(healthLog.value[1].transition).toBeNull();
    await online.stopPolling();
  });
});
