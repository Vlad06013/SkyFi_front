import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Router } from 'vue-router';
import { fetchUser } from '@/api/auth';
import { getSession } from '@/lib/session';
import { createAppRouter } from '@/router';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  fetchUser: vi.fn(),
  logout: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
  deleteAvatar: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
  setSession: vi.fn(),
  clearSession: vi.fn(),
}));

const fetchUserMock = vi.mocked(fetchUser);
const getSessionMock = vi.mocked(getSession);

const stored = {
  token: 't1',
  user: { id: 1, name: 'Влад', email: 'vlad@mail.ru', avatar_url: null },
};

async function goto(router: Router, path: string) {
  await router.push(path);
  await router.isReady();
  return router.currentRoute.value;
}

describe('router guard', () => {
  let router: Router;

  beforeEach(() => {
    setActivePinia(createPinia());
    router = createAppRouter();
  });

  it('гость на / уходит на /login с redirect', async () => {
    useAppStore().phase = 'ready';
    const route = await goto(router, '/');
    expect(route.path).toBe('/login');
    // Редирект записи '/' → '/home' ресолвится до гварда.
    expect(route.query.redirect).toBe('/home');
  });

  it('залогиненный на / попадает на /home', async () => {
    useAppStore().phase = 'ready';
    const auth = useAuthStore();
    auth.user = stored.user;
    auth.token = stored.token;

    const route = await goto(router, '/');
    expect(route.path).toBe('/home');
  });

  it('гостю /login доступен', async () => {
    useAppStore().phase = 'ready';
    const route = await goto(router, '/login');
    expect(route.path).toBe('/login');
  });

  it('залогиненного с /login уводит на /home', async () => {
    useAppStore().phase = 'ready';
    const auth = useAuthStore();
    auth.user = stored.user;

    const route = await goto(router, '/login');
    expect(route.path).toBe('/home');
  });

  it('гвард ждёт бутстрэп: без токена → /login', async () => {
    getSessionMock.mockResolvedValue(null);

    const route = await goto(router, '/');
    expect(route.path).toBe('/login');
    expect(useAppStore().phase).toBe('ready');
  });

  it('гвард ждёт бутстрэп: токен → /home, сессия из хранилища без GET /user', async () => {
    getSessionMock.mockResolvedValue(stored);
    fetchUserMock.mockResolvedValue({ ...stored.user, name: 'Свежий' });

    const route = await goto(router, '/');
    expect(route.path).toBe('/home');
    expect(useAuthStore().isAuthed).toBe(true);
    expect(useAuthStore().user?.name).toBe('Влад');
    // Свежесть сессии — по первому коннекту сокета, не бутстрэпом.
    expect(fetchUserMock).not.toHaveBeenCalled();
  });
});
