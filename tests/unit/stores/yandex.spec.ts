import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ApiError } from '@/api/http';
import * as yandexApi from '@/api/yandex';
import { useYandexStore } from '@/stores/yandex';

vi.mock('@/api/yandex', () => ({
  startYandexDeviceAuth: vi.fn(),
  fetchYandexDeviceStatus: vi.fn(),
  disconnectYandex: vi.fn(),
}));

const startMock = vi.mocked(yandexApi.startYandexDeviceAuth);
const statusMock = vi.mocked(yandexApi.fetchYandexDeviceStatus);
const disconnectMock = vi.mocked(yandexApi.disconnectYandex);

function store() {
  return useYandexStore();
}

describe('stores/yandex', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    startMock.mockReset();
    statusMock.mockReset();
    disconnectMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refresh not_started → не подключён, без кода', async () => {
    statusMock.mockResolvedValue({ status: 'not_started', connected: false });
    const s = store();
    await s.refresh();
    expect(s.connected).toBe(false);
    expect(s.awaiting).toBe(false);
    expect(s.expired).toBe(false);
    expect(s.userCode).toBeNull();
  });

  it('refresh с активной сессией → код/ссылка и старт поллинга', async () => {
    statusMock.mockResolvedValue({
      status: 'pending',
      connected: false,
      verification_url: 'https://ya.ru/device',
      user_code: 'sjh6tud4',
    });
    const s = store();
    await s.refresh();
    expect(s.awaiting).toBe(true);
    expect(s.userCode).toBe('sjh6tud4');
    expect(s.verificationUrl).toBe('https://ya.ru/device');
    expect(statusMock).toHaveBeenCalledTimes(1);

    // Поллинг каждые 3 с.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(statusMock).toHaveBeenCalledTimes(2);
  });

  it('поллинг дождался connected → подключён, поллинг остановлен', async () => {
    startMock.mockResolvedValue({ session_id: 's1', status: 'pending', verification_url: 'u', user_code: 'c1' });
    statusMock
      .mockResolvedValueOnce({ status: 'pending', connected: false, verification_url: 'u', user_code: 'c1' })
      .mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    const s = store();
    await s.connect();
    // Первый тик ещё pending, второй — connected.
    await vi.advanceTimersByTimeAsync(6_000);

    expect(s.connected).toBe(true);
    expect(s.awaiting).toBe(false);
    expect(s.userCode).toBeNull();
    expect(statusMock).toHaveBeenCalledTimes(2);

    // Дальше тиков нет — поллер встал.
    await vi.advanceTimersByTimeAsync(9_000);
    expect(statusMock).toHaveBeenCalledTimes(2);
  });

  it('connect стартует сессию и показывает код из ответа start', async () => {
    startMock.mockResolvedValue({ session_id: 's1', status: 'pending', verification_url: 'https://ya.ru/device', user_code: 'abc123' });
    statusMock.mockResolvedValue({ status: 'pending', connected: false });
    const s = store();
    await s.connect();

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(s.awaiting).toBe(true);
    expect(s.userCode).toBe('abc123');
    expect(s.connected).toBe(false);
  });

  it('сессия протухла → expired, поллинг остановлен', async () => {
    statusMock.mockResolvedValue({ status: 'pending', connected: false, verification_url: 'u', user_code: 'c1' });
    const s = store();
    await s.refresh();
    expect(s.expired).toBe(false);

    statusMock.mockResolvedValue({ status: 'expired', connected: false });
    await vi.advanceTimersByTimeAsync(3_000);

    expect(s.expired).toBe(true);
    expect(s.awaiting).toBe(false);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(statusMock).toHaveBeenCalledTimes(2);
  });

  it('сетевой сбой поллинга глушится, состояние не ломается', async () => {
    statusMock.mockResolvedValueOnce({ status: 'pending', connected: false, verification_url: 'u', user_code: 'c1' });
    const s = store();
    await s.refresh();

    statusMock.mockRejectedValue(new ApiError(null, 'network', 'Нет соединения.'));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(s.awaiting).toBe(true);

    // Восстановление на следующем тике.
    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(s.connected).toBe(true);
  });

  it('refresh пробрасывает ошибку карточке', async () => {
    statusMock.mockRejectedValue(new ApiError(429, 'rate-limit', 'Слишком часто.'));
    await expect(store().refresh()).rejects.toMatchObject({ status: 429 });
    expect(store().connected).toBeNull();
  });

  it('disconnect чистит состояние и встаёт', async () => {
    disconnectMock.mockResolvedValue({ connected: false, message: 'Яндекс Музыка отключена.' });
    statusMock.mockResolvedValue({ status: 'pending', connected: true, verification_url: 'u', user_code: 'c1' });
    const s = store();
    await s.refresh();

    await s.disconnect();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(s.connected).toBe(false);
    expect(s.awaiting).toBe(false);
    expect(s.userCode).toBeNull();

    await vi.advanceTimersByTimeAsync(9_000);
    expect(statusMock).toHaveBeenCalledTimes(1);
  });

  it('ошибка disconnect пробрасывается, состояние не сброшено', async () => {
    disconnectMock.mockRejectedValue(new ApiError(null, 'network', 'Нет соединения.'));
    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    const s = store();
    await s.refresh();
    expect(s.connected).toBe(true);

    await s.disconnect().catch(() => undefined);
    expect(s.connected).toBe(true);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });
});
