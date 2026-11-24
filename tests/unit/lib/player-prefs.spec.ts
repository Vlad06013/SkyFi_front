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

  it('пишет и читает громкость и режим клипов', async () => {
    await writePlayerDevicePrefs({ volume: 140, clipMode: true });
    await expect(readPlayerDevicePrefs()).resolves.toEqual({ volume: 100, clipMode: true });
  });

  it('битая запись — null', async () => {
    memory.set('skyfi.player-prefs', '{oops');
    await expect(readPlayerDevicePrefs()).resolves.toBeNull();
  });
});
