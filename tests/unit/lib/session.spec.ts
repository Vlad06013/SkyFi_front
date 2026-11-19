import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, getSession, setSession } from '@/lib/session';
import type { StoredSession } from '@/lib/session';

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

const fixture: StoredSession = {
  token: 't1',
  user: { id: 1, name: 'Влад', email: 'vlad@mail.ru', avatar_url: null },
};

describe('lib/session', () => {
  beforeEach(() => {
    memory.clear();
  });

  it('null при отсутствии записи', async () => {
    await expect(getSession()).resolves.toBeNull();
  });

  it('roundtrip set/get', async () => {
    await setSession(fixture);
    await expect(getSession()).resolves.toEqual(fixture);
  });

  it('clear удаляет сессию', async () => {
    await setSession(fixture);
    await clearSession();
    await expect(getSession()).resolves.toBeNull();
  });

  it('битый JSON → null', async () => {
    memory.set('skyfi.session', '{oops');
    await expect(getSession()).resolves.toBeNull();
  });

  it('запись без токена → null', async () => {
    memory.set('skyfi.session', JSON.stringify({ user: fixture.user }));
    await expect(getSession()).resolves.toBeNull();
  });
});
