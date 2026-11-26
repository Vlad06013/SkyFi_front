import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as qrApi from '@/api/qr';
import { ApiError } from '@/api/http';
import { useQrLogin } from '@/composables/useQrLogin';

vi.mock('@/api/qr', () => ({
  startQrLogin: vi.fn(),
  fetchQrStatus: vi.fn(),
  confirmQrLogin: vi.fn(),
}));

const startMock = vi.mocked(qrApi.startQrLogin);
const statusMock = vi.mocked(qrApi.fetchQrStatus);

const started = {
  code: 'c1',
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  qr_svg: '<svg>qr</svg>',
};

describe('composables/useQrLogin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('старт → поллинг: svg на месте, статус дёргается сразу и раз в 2 с', async () => {
    startMock.mockResolvedValue(started);
    statusMock.mockResolvedValue({ status: 'pending', token: null, user: null });
    const qr = useQrLogin();

    await qr.start();
    expect(qr.phase.value).toBe('polling');
    expect(qr.qrSvg.value).toBe('<svg>qr</svg>');
    expect(statusMock).toHaveBeenCalledWith('c1');

    await vi.advanceTimersByTimeAsync(2_000);
    expect(statusMock).toHaveBeenCalledTimes(2);
    qr.stop();
  });

  it('confirmed → payload и остановка поллинга', async () => {
    const user = { id: 1, name: 'Влад', email: 'v@m.r', avatar_url: null };
    startMock.mockResolvedValue(started);
    statusMock.mockResolvedValue({ status: 'confirmed', token: 't1', user });
    const qr = useQrLogin();

    await qr.start();
    await vi.waitFor(() => expect(qr.phase.value).toBe('confirmed'));

    expect(qr.payload.value).toEqual({ token: 't1', user });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(statusMock).toHaveBeenCalledTimes(1);
    qr.stop();
  });

  it('404 при поллинге → expired', async () => {
    startMock.mockResolvedValue(started);
    statusMock.mockRejectedValue(new ApiError(404, 'not-found', 'QR-код не найден.'));
    const qr = useQrLogin();

    await qr.start();
    await vi.waitFor(() => expect(qr.phase.value).toBe('expired'));
    qr.stop();
  });

  it('сеть/5xx при поллинге не роняют процесс', async () => {
    startMock.mockResolvedValue(started);
    statusMock
      .mockRejectedValueOnce(new ApiError(null, 'network', 'Нет соединения.'))
      .mockResolvedValue({ status: 'pending', token: null, user: null });
    const qr = useQrLogin();

    await qr.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(qr.phase.value).toBe('polling');
    qr.stop();
  });

  it('сбой старта → expired', async () => {
    startMock.mockRejectedValue(new ApiError(null, 'network', 'Нет соединения.'));
    const qr = useQrLogin();

    await qr.start();
    expect(qr.phase.value).toBe('expired');
  });

  it('локальный дедлайн expires_at → expired', async () => {
    startMock.mockResolvedValue({
      ...started,
      expires_at: new Date(Date.now() + 5_000).toISOString(),
    });
    statusMock.mockResolvedValue({ status: 'pending', token: null, user: null });
    const qr = useQrLogin();

    await qr.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(qr.phase.value).toBe('expired');
    qr.stop();
  });
});
