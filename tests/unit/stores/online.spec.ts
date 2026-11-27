import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useOnlineStore } from '@/stores/online';

const hoisted = vi.hoisted(() => {
  return {
    resolveEndpointMock: vi.fn(async () => false),
    /** Хендлер исходов запросов, который стор регистрирует в http. */
    outcome: null as null | ((ok: boolean) => void),
  };
});

vi.mock('@/lib/endpoints', () => ({
  resolveEndpoint: hoisted.resolveEndpointMock,
}));

// Подменяем регистрацию хендлера исходов: оригинал отрабатывает (стор
// ставит свой обработчик), а тест дёргает захваченный напрямую.
vi.mock('@/api/http', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/http')>();
  return {
    ...original,
    setNetworkOutcomeHandler: (handler: (ok: boolean) => void) => {
      hoisted.outcome = handler;
      original.setNetworkOutcomeHandler(handler);
    },
  };
});

import { clearNetLog, netLog } from '@/lib/net-log';

const GRACE_MS = 3_000;

describe('stores/online — детект на сокете', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    clearNetLog();
    hoisted.resolveEndpointMock.mockClear();
    hoisted.outcome = null;
    vi.useFakeTimers();
  });

  it('connect: онлайн мгновенно, переход записан в журнал', () => {
    const online = useOnlineStore();
    expect(online.isOnline).toBeNull();

    online.noteSocketConnected();
    expect(online.isOnline).toBe(true);
    expect(netLog.value.at(-1)).toMatchObject({ event: 'connect', transition: 'online' });
  });

  it('disconnect: офлайн только после грейса; reconnect внутри грейса отменяет', () => {
    const online = useOnlineStore();
    online.noteSocketConnected();

    online.noteSocketDisconnected();
    expect(online.isOnline).toBe(true);

    vi.advanceTimersByTime(GRACE_MS - 1);
    expect(online.isOnline).toBe(true);

    // Вернулось соединение внутри грейса — офлайна не было.
    online.noteSocketConnected();
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(online.isOnline).toBe(true);
  });

  it('disconnect: после грейса — офлайн с записью перехода', () => {
    const online = useOnlineStore();
    online.noteSocketConnected();

    online.noteSocketDisconnected();
    vi.advanceTimersByTime(GRACE_MS);
    expect(online.isOnline).toBe(false);
    expect(netLog.value.at(-1)).toMatchObject({ event: 'disconnect', transition: 'offline' });
  });

  it('failed: офлайн сразу + переспрос адреса (resolveEndpoint)', async () => {
    const online = useOnlineStore();
    online.noteSocketConnected();

    await online.noteSocketFailed('failed');
    expect(online.isOnline).toBe(false);
    expect(hoisted.resolveEndpointMock).toHaveBeenCalledTimes(1);

    // Повторный failed сразу — кулдаун resolveEndpoint, зонд не дёргаем.
    await online.noteSocketFailed('failed');
    expect(hoisted.resolveEndpointMock).toHaveBeenCalledTimes(1);
  });

  it('серия сетевых фейлов при живом сокете: force-offline + рестарт сокета', () => {
    const online = useOnlineStore();
    const reconnects: string[] = [];
    online.setReconnectHandler(() => reconnects.push('restart'));
    online.noteSocketConnected();

    hoisted.outcome?.(false);
    hoisted.outcome?.(false);
    expect(online.isOnline).toBe(true);

    hoisted.outcome?.(false);
    expect(online.isOnline).toBe(false);
    expect(netLog.value.at(-1)).toMatchObject({ event: 'force-offline', transition: 'offline' });
    expect(reconnects).toEqual(['restart']);
  });

  it('успешный ответ сбрасывает серию фейлов', () => {
    const online = useOnlineStore();
    online.noteSocketConnected();

    hoisted.outcome?.(false);
    hoisted.outcome?.(false);
    hoisted.outcome?.(true);
    hoisted.outcome?.(false);
    hoisted.outcome?.(false);
    expect(online.isOnline).toBe(true);
  });

  it('onOnline: хендлер вызывается на каждый переход в онлайн', () => {
    const online = useOnlineStore();
    const calls: string[] = [];
    online.onOnline(() => calls.push('online'));

    online.noteSocketConnected();
    online.noteSocketConnected(); // повторный connect — перехода нет
    expect(calls).toEqual(['online']);
  });
});
