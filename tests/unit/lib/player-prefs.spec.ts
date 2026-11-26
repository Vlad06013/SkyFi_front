import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPlayerDevicePrefs, writePlayerDevicePrefs } from '@/lib/player-prefs';

const memory = vi.hoisted(() => new Map<string, string>());

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: memory.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      memory.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      memory.delete(key);
    },
  },
}));

describe('lib/player-prefs', () => {
  beforeEach(() => {
    memory.clear();
  });

  it('пустое хранилище — null', async () => {
    await expect(readPlayerDevicePrefs()).resolves.toBeNull();
  });

  it('пишет и читает громкость (кламп 0–100) и качество клипа', async () => {
    await writePlayerDevicePrefs({ volume: 140, clipQuality: 1080, clipHlsAuto: false });
    await expect(readPlayerDevicePrefs()).resolves.toEqual({ volume: 100, clipQuality: 1080, clipHlsAuto: false });
  });

  it('запись старого формата (только громкость) — дефолты качества', async () => {
    memory.set('skyfi.player-prefs', JSON.stringify({ volume: 55 }));
    await expect(readPlayerDevicePrefs()).resolves.toEqual({ volume: 55, clipQuality: null, clipHlsAuto: true });
  });

  it('невалидное качество отбрасывается, auto по умолчанию', async () => {
    memory.set('skyfi.player-prefs', JSON.stringify({ volume: 50, clipQuality: 99999, clipHlsAuto: 'да' }));
    await expect(readPlayerDevicePrefs()).resolves.toEqual({ volume: 50, clipQuality: null, clipHlsAuto: true });
  });

  it('битая запись — null', async () => {
    memory.set('skyfi.player-prefs', '{oops');
    await expect(readPlayerDevicePrefs()).resolves.toBeNull();
  });
});
