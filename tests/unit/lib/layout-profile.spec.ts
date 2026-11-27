import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async () => ({ value: null })),
    set: vi.fn(async () => undefined),
  },
}));

import { Preferences } from '@capacitor/preferences';
import {
  applyLayoutProfile,
  deviceTypeForLayout,
  readLayoutProfile,
  writeLayoutProfile,
} from '@/lib/layout-profile';

const getMock = vi.mocked(Preferences.get);
const setMock = vi.mocked(Preferences.set);

describe('lib/layout-profile', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.layout;
    getMock.mockReset();
    setMock.mockReset();
    getMock.mockResolvedValue({ value: null });
    setMock.mockResolvedValue();
  });

  it('auto снимает data-layout, явный профиль ставит', () => {
    applyLayoutProfile('car');
    expect(document.documentElement.dataset.layout).toBe('car');
    applyLayoutProfile('auto');
    expect(document.documentElement.dataset.layout).toBeUndefined();
  });

  it('явный профиль уходит на бэк своим типом, auto в браузере — computer', () => {
    expect(deviceTypeForLayout('car')).toBe('car');
    expect(deviceTypeForLayout('tv')).toBe('tv');
    expect(deviceTypeForLayout('phone')).toBe('phone');
    expect(deviceTypeForLayout('auto')).toBe('computer');
  });

  it('пустое хранилище в браузере — auto', async () => {
    await expect(readLayoutProfile()).resolves.toBe('auto');
  });

  it('запись кладёт профиль в Preferences', async () => {
    await writeLayoutProfile('car');
    expect(setMock).toHaveBeenCalledWith({ key: 'skyfi.layout', value: 'car' });
  });
});
