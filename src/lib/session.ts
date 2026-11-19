import { Preferences } from '@capacitor/preferences';
import type { AuthUser } from '@/types';

const SESSION_KEY = 'skyfi.session';

/** Сессия целиком: токен + профиль — офлайн-вход без GET /user. */
export interface StoredSession {
  token: string;
  user: AuthUser;
}

export async function getSession(): Promise<StoredSession | null> {
  const { value } = await Preferences.get({ key: SESSION_KEY });
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StoredSession;
    return typeof parsed?.token === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export async function setSession(session: StoredSession): Promise<void> {
  await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) });
}

export async function clearSession(): Promise<void> {
  await Preferences.remove({ key: SESSION_KEY });
}
