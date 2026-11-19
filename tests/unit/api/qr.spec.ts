import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import { confirmQrLogin, fetchQrStatus, startQrLogin } from '@/api/qr';

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const getMock = vi.mocked(http.get);
const postMock = vi.mocked(http.post);

describe('api/qr', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it('start: POST qr-login без тела', async () => {
    const payload = { code: 'c1', expires_at: 't', qr_svg: '<svg/>' };
    postMock.mockResolvedValue(payload);
    await expect(startQrLogin()).resolves.toEqual(payload);
    expect(postMock).toHaveBeenCalledWith('qr-login');
  });

  it('status: GET qr-login/{code} с кодировкой', async () => {
    getMock.mockResolvedValue({ status: 'pending', token: null, user: null });
    await fetchQrStatus('a/b');
    expect(getMock).toHaveBeenCalledWith('qr-login/a%2Fb');
  });

  it('confirm: POST qr-login/confirm с кодом', async () => {
    postMock.mockResolvedValue({ status: 'confirmed' });
    await confirmQrLogin('c1');
    expect(postMock).toHaveBeenCalledWith('qr-login/confirm', { code: 'c1' });
  });
});
