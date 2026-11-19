import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ApiError } from '@/api/http';
import * as yandexApi from '@/api/yandex';
import type { YandexImportProgressPayload } from '@/types';
import { useYandexStore } from '@/stores/yandex';

vi.mock('@/api/yandex', () => ({
  startYandexDeviceAuth: vi.fn(),
  fetchYandexDeviceStatus: vi.fn(),
  disconnectYandex: vi.fn(),
  fetchYandexImportSummary: vi.fn(),
  startYandexImport: vi.fn(),
  fetchYandexImportProgress: vi.fn(),
  cancelYandexImport: vi.fn(),
}));

const startMock = vi.mocked(yandexApi.startYandexDeviceAuth);
const statusMock = vi.mocked(yandexApi.fetchYandexDeviceStatus);
const disconnectMock = vi.mocked(yandexApi.disconnectYandex);
const summaryMock = vi.mocked(yandexApi.fetchYandexImportSummary);
const startImportMock = vi.mocked(yandexApi.startYandexImport);
const progressMock = vi.mocked(yandexApi.fetchYandexImportProgress);
const cancelImportMock = vi.mocked(yandexApi.cancelYandexImport);

const SUMMARY = {
  tracks: { total: 1248, existing: 0 },
  videos: { total: 0, existing: 0 },
  albums: { total: 86, existing: 0 },
  playlists: { total: 12, existing: 0 },
  artists: { total: 41, existing: 0 },
};

function progress(overrides: Partial<YandexImportProgressPayload> = {}) {
  return {
    job_id: 'j1',
    status: 'running',
    total: 100,
    processed: 40,
    imported: 40,
    skipped: 0,
    failed: 0,
    progress: 40,
    message: null,
    started_at: 't',
    finished_at: null,
    ...overrides,
  };
}

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
    summaryMock.mockReset();
    startImportMock.mockReset();
    progressMock.mockReset();
    cancelImportMock.mockReset();
    // Импортные вызовы по умолчанию тихие и пустые.
    summaryMock.mockResolvedValue(SUMMARY);
    progressMock.mockResolvedValue(null);
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

  it('refresh при подключённом Яндексе подгружает сводку и прогресс', async () => {
    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    progressMock.mockResolvedValue(progress({ status: 'completed' }));
    const s = store();
    await s.refresh();
    await vi.advanceTimersByTimeAsync(0);

    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(progressMock).toHaveBeenCalledTimes(1);
    expect(s.summary?.tracks.total).toBe(1248);
    expect(s.progress?.status).toBe('completed');
    expect(s.importActive).toBe(false);
  });

  it('summary без подключения (422) глушится: сводки нет, на стор не влияет', async () => {
    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    summaryMock.mockRejectedValue(new ApiError(422, 'validation', 'Яндекс Музыка не подключена.'));
    const s = store();
    await s.refresh();
    await vi.advanceTimersByTimeAsync(0);

    expect(s.connected).toBe(true);
    expect(s.summary).toBeNull();
  });

  it('startImport кладёт прогресс и поллит джобу; completed обновляет сводку', async () => {
    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    const s = store();
    await s.refresh();
    await vi.advanceTimersByTimeAsync(0);

    startImportMock.mockResolvedValue(progress({ status: 'queued', total: 0, processed: 0, progress: 0 }));
    await s.startImport();
    expect(s.importActive).toBe(true);

    // Джоба пошла, тикаем поллинг: running → completed.
    progressMock.mockResolvedValue(progress({ status: 'running' }));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(s.progress?.status).toBe('running');

    const done = progress({ status: 'completed', processed: 100, imported: 90, skipped: 10, progress: 100, finished_at: 't' });
    progressMock.mockResolvedValue(done);
    const summaryCallsBefore = summaryMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3_000);

    expect(s.importActive).toBe(false);
    expect(s.progress?.status).toBe('completed');
    expect(summaryMock.mock.calls.length).toBe(summaryCallsBefore + 1);
    // Поллер встал на финале (1 вызов был ещё при refresh).
    await vi.advanceTimersByTimeAsync(9_000);
    expect(progressMock).toHaveBeenCalledTimes(3);
  });

  it('startImport не пускает параллельный импорт, пока джоба активна', async () => {
    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    startImportMock.mockResolvedValue(progress({ status: 'running' }));
    const s = store();
    await s.refresh();
    await vi.advanceTimersByTimeAsync(0);

    await s.startImport();
    await s.startImport();
    expect(startImportMock).toHaveBeenCalledTimes(1);
  });

  it('cancelImport останавливает джобу и поллинг', async () => {
    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    startImportMock.mockResolvedValue(progress({ status: 'running' }));
    cancelImportMock.mockResolvedValue(progress({ status: 'cancelled', message: 'Импорт отменён', finished_at: 't' }));
    const s = store();
    await s.refresh();
    await vi.advanceTimersByTimeAsync(0);
    await s.startImport();
    expect(s.importActive).toBe(true);

    await s.cancelImport();
    expect(s.importActive).toBe(false);
    expect(s.progress?.status).toBe('cancelled');

    await vi.advanceTimersByTimeAsync(9_000);
    expect(progressMock).toHaveBeenCalledTimes(1);
  });

  it('disconnect чистит сводку и прогресс', async () => {
    disconnectMock.mockResolvedValue({ connected: false, message: 'отключена' });
    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    startImportMock.mockResolvedValue(progress({ status: 'running' }));
    const s = store();
    await s.refresh();
    await vi.advanceTimersByTimeAsync(0);
    await s.startImport();
    expect(s.summary).not.toBeNull();
    expect(s.importActive).toBe(true);

    await s.disconnect();
    expect(s.summary).toBeNull();
    expect(s.progress).toBeNull();
    expect(s.importActive).toBe(false);
  });

  it('сетевой сбой поллинга джобы глушится, джоба остаётся активной', async () => {
    statusMock.mockResolvedValue({ status: 'connected', connected: true, message: 'ок' });
    startImportMock.mockResolvedValue(progress({ status: 'running' }));
    const s = store();
    await s.refresh();
    await vi.advanceTimersByTimeAsync(0);
    await s.startImport();

    progressMock.mockRejectedValueOnce(new ApiError(null, 'network', 'Нет соединения.'));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(s.importActive).toBe(true);

    progressMock.mockResolvedValue(progress({ status: 'completed', processed: 100, imported: 100, progress: 100 }));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(s.importActive).toBe(false);
  });
});
