import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDevice, ensureDevice, getDevice } from '@/lib/device';

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

    const again = await ensureDevice();
    expect(again.uuid).toBe(first.uuid);
    await expect(getDevice()).resolves.toEqual(first);
  });

  it('битый JSON → null', async () => {
    memory.set('skyfi.device', '{oops');
    await expect(getDevice()).resolves.toBeNull();
  });

  it('запись старого формата (с серверным id) читается по uuid', async () => {
    memory.set('skyfi.device', JSON.stringify({ uuid: 'uuid-legacy', serverId: 42 }));
    await expect(getDevice()).resolves.toEqual({ uuid: 'uuid-legacy', serverId: 42 });
  });

  it('clearDevice удаляет запись', async () => {
    await ensureDevice();
    await clearDevice();
    await expect(getDevice()).resolves.toBeNull();
  });
});
