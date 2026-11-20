import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDevice, ensureDevice, getDevice, saveServerId } from '@/lib/device';

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

describe('lib/device', () => {
  beforeEach(() => {
    memory.clear();
  });

  it('null при отсутствии записи', async () => {
    await expect(getDevice()).resolves.toBeNull();
  });

  it('ensureDevice генерирует строгий UUID и персистит его', async () => {
    const first = await ensureDevice();
    expect(first.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(first.serverId).toBeNull();

    const again = await ensureDevice();
    expect(again.uuid).toBe(first.uuid);
    await expect(getDevice()).resolves.toEqual(first);
  });

  it('saveServerId дописывает серверный id, uuid не меняется', async () => {
    const stored = await ensureDevice();
    await expect(saveServerId(42)).resolves.toEqual({ uuid: stored.uuid, serverId: 42 });
    await expect(getDevice()).resolves.toEqual({ uuid: stored.uuid, serverId: 42 });
  });

  it('saveServerId без записи → null', async () => {
    await expect(saveServerId(42)).resolves.toBeNull();
  });

  it('битый JSON → null', async () => {
    memory.set('skyfi.device', '{oops');
    await expect(getDevice()).resolves.toBeNull();
  });

  it('clearDevice удаляет запись', async () => {
    await ensureDevice();
    await clearDevice();
    await expect(getDevice()).resolves.toBeNull();
  });
});
