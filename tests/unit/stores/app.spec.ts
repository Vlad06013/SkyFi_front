import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { checkHealth } from '@/api/health';
import { fetchUser } from '@/api/auth';
import { getSession } from '@/lib/session';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/api/health', () => ({
  checkHealth: vi.fn(),
}));

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

const checkHealthMock = vi.mocked(checkHealth);
const fetchUserMock = vi.mocked(fetchUser);
const getSessionMock = vi.mocked(getSession);

const stored = {
  token: 't1',
  user: { id: 1, name: 'Влад', email: 'vlad@mail.ru', avatar_url: null },
};

const freshUser = { ...stored.user, name: 'Свежий' };

describe('stores/app — bootstrap', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('онлайн + токен: сессия восстановлена, профиль освежён', async () => {
    checkHealthMock.mockResolvedValue(true);
    getSessionMock.mockResolvedValue(stored);
    fetchUserMock.mockResolvedValue(freshUser);

    const appStore = useAppStore();
    expect(appStore.phase).toBe('splash');

    await appStore.bootstrap();

    expect(appStore.phase).toBe('ready');
    const auth = useAuthStore();
    expect(auth.isAuthed).toBe(true);
    expect(auth.user?.name).toBe('Свежий');
    expect(fetchUserMock).toHaveBeenCalledTimes(1);
  });

  it('онлайн без токена: гость', async () => {
    checkHealthMock.mockResolvedValue(true);
    getSessionMock.mockResolvedValue(null);

    await useAppStore().bootstrap();

    const auth = useAuthStore();
    expect(auth.isAuthed).toBe(false);
    expect(fetchUserMock).not.toHaveBeenCalled();
  });

  it('офлайн + токен: входим по сохранённому профилю без GET /user', async () => {
    checkHealthMock.mockResolvedValue(false);
    getSessionMock.mockResolvedValue(stored);

    await useAppStore().bootstrap();

    const auth = useAuthStore();
    expect(auth.isAuthed).toBe(true);
    expect(auth.user).toEqual(stored.user);
    expect(fetchUserMock).not.toHaveBeenCalled();
  });

  it('офлайн без токена: гость (гвард уведёт на /login)', async () => {
    checkHealthMock.mockResolvedValue(false);
    getSessionMock.mockResolvedValue(null);

    await useAppStore().bootstrap();

    expect(useAuthStore().isAuthed).toBe(false);
  });

  it('bootstrap выполняется один раз при повторных await', async () => {
    checkHealthMock.mockResolvedValue(true);
    getSessionMock.mockResolvedValue(null);

    const appStore = useAppStore();
    await Promise.all([appStore.bootstrap(), appStore.bootstrap()]);

    expect(checkHealthMock).toHaveBeenCalledTimes(1);
  });

  it('recheck после офлайна: онлайн → рефреш сессии', async () => {
    checkHealthMock.mockResolvedValue(false);
    getSessionMock.mockResolvedValue(stored);
    const appStore = useAppStore();
    await appStore.bootstrap();
    expect(useAuthStore().user?.name).toBe('Влад');

    checkHealthMock.mockResolvedValue(true);
    fetchUserMock.mockResolvedValue(freshUser);
    await appStore.recheck();

    expect(useAuthStore().user?.name).toBe('Свежий');
  });
});
