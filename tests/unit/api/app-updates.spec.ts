import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import { fetchAppUpdate, fetchLatestApk } from '@/api/app-updates';
import { BUNDLE_VERSION } from '@/lib/bundle-version';
import type { AppUpdatePayload } from '@/types/app-update';

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
  },
}));

const getMock = vi.mocked(http.get);

const apkOffer: AppUpdatePayload = {
  kind: 'apk',
  version: '1.2.0',
  url: 'http://backend/app-updates/download-apk/3?signature=x',
  sha256: 'abc',
  size_bytes: 1000,
  mandatory: false,
  notes: null,
};

describe('api/app-updates', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('check: платформа, обе версии и apk=1', async () => {
    getMock.mockResolvedValue(null);
    await fetchAppUpdate('1.0.32', '1.1.0');
    expect(getMock).toHaveBeenCalledWith('app-updates/check', {
      params: { platform: 'android', current: '1.0.32', shell: '1.1.0', apk: 1 },
    });
  });

  it('latestApk: shell=0.0.0, оффер оболочки возвращается', async () => {
    getMock.mockResolvedValue(apkOffer);
    await expect(fetchLatestApk()).resolves.toEqual(apkOffer);
    expect(getMock).toHaveBeenCalledWith('app-updates/check', {
      params: { platform: 'android', current: BUNDLE_VERSION, shell: '0.0.0', apk: 1 },
    });
  });

  it('latestApk: оффер бандла или null — это «APK не опубликован»', async () => {
    getMock.mockResolvedValue({ ...apkOffer, kind: 'bundle' });
    await expect(fetchLatestApk()).resolves.toBeNull();
    getMock.mockResolvedValue(null);
    await expect(fetchLatestApk()).resolves.toBeNull();
  });
});
