import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  activeOrigin: () => 'http://backend.test',
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

  it('failed: офлайн после грейса + переспрос адреса сразу (resolveEndpoint)', async () => {
    const online = useOnlineStore();
    online.noteSocketConnected();

    await online.noteSocketFailed('failed');
    // Баннер не мигает на ретраях: офлайн только после грейса.
    expect(online.isOnline).toBe(true);
    expect(hoisted.resolveEndpointMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(GRACE_MS);
    expect(online.isOnline).toBe(false);

    // Повторный failed — кулдаун resolveEndpoint, зонд не дёргаем.
    await online.noteSocketFailed('failed');
    expect(hoisted.resolveEndpointMock).toHaveBeenCalledTimes(1);
  });

  it('unavailable между ретраями сокета: reconnect внутри грейса — офлайна не было', async () => {
    const online = useOnlineStore();
    online.noteSocketConnected();

    online.noteSocketDisconnected();
    await online.noteSocketFailed('unavailable');
    vi.advanceTimersByTime(GRACE_MS - 1);
    expect(online.isOnline).toBe(true);

    online.noteSocketConnected();
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(online.isOnline).toBe(true);
  });

  it('серия разрывов не растягивает грейс: офлайн от первого события', async () => {
    const online = useOnlineStore();
    online.noteSocketConnected();

    online.noteSocketDisconnected();
    vi.advanceTimersByTime(GRACE_MS - 500);
    await online.noteSocketFailed('unavailable');
    vi.advanceTimersByTime(500);
    expect(online.isOnline).toBe(false);
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

  it('конец сессии сбрасывает офлайн и отменяет грейс — это не обрыв', () => {
    const online = useOnlineStore();
    online.noteSocketConnected();

    online.noteSocketDisconnected();
    online.noteSessionEnded();
    vi.advanceTimersByTime(GRACE_MS * 2);

    expect(online.isOnline).toBeNull();
    expect(netLog.value.at(-1)).toMatchObject({ event: 'disconnect', detail: 'сессия закрыта', transition: null });
  });

  it('конец сессии из уже офлайна тоже возвращает null', () => {
    const online = useOnlineStore();
    online.noteSocketConnected();
    online.noteSocketDisconnected();
    vi.advanceTimersByTime(GRACE_MS);
    expect(online.isOnline).toBe(false);

    online.noteSessionEnded();
    expect(online.isOnline).toBeNull();
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

describe('stores/online — стартовый зонд (баг 14)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    clearNetLog();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('бэк не ответил: офлайн сразу, без грейса; сокет потом переведёт в онлайн', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('network'))));
    const online = useOnlineStore();

    await online.probeAtStartup();
    expect(online.isOnline).toBe(false);
    expect(netLog.value.at(-1)).toMatchObject({ event: 'probe', transition: 'offline' });

    online.noteSocketConnected();
    expect(online.isOnline).toBe(true);
  });

  it('бэк ответил (любой HTTP): флаг не трогаем — онлайн подтвердит сокет', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const online = useOnlineStore();

    await online.probeAtStartup();
    expect(online.isOnline).toBeNull();
    expect(netLog.value).toHaveLength(0);
  });

  it('бэк молчит дольше таймаута: офлайн по abort', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ),
    );
    const online = useOnlineStore();

    const probe = online.probeAtStartup();
    await vi.advanceTimersByTimeAsync(2_500);
    await probe;
    expect(online.isOnline).toBe(false);
  });

  it('navigator.onLine = false: офлайн сразу, без запроса', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const online = useOnlineStore();

    await online.probeAtStartup();
    expect(online.isOnline).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
