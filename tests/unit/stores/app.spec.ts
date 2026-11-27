import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { fetchUser } from '@/api/auth';
import { getSession } from '@/lib/session';
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

describe('stores/app — bootstrap', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('токен: сессия восстановлена из хранилища, GET /user на старте не дёргается', async () => {
    getSessionMock.mockResolvedValue(stored);
    fetchUserMock.mockResolvedValue({ ...stored.user, name: 'Свежий' });

    const appStore = useAppStore();
    expect(appStore.phase).toBe('splash');

    await appStore.bootstrap();

    expect(appStore.phase).toBe('ready');
    const auth = useAuthStore();
    expect(auth.isAuthed).toBe(true);
    expect(auth.user?.name).toBe('Влад');
    // Свежесть токена проверяет первый коннект сокета (main.ts), не bootstrap.
    expect(fetchUserMock).not.toHaveBeenCalled();
  });

  it('без токена: гость', async () => {
    getSessionMock.mockResolvedValue(null);

    await useAppStore().bootstrap();

    const auth = useAuthStore();
    expect(auth.isAuthed).toBe(false);
    expect(fetchUserMock).not.toHaveBeenCalled();
  });

  it('bootstrap выполняется один раз при повторных await', async () => {
    getSessionMock.mockResolvedValue(null);

    const appStore = useAppStore();
    await Promise.all([appStore.bootstrap(), appStore.bootstrap()]);

    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it('recheck: повтор входа со свежим GET /user', async () => {
    getSessionMock.mockResolvedValue(stored);
    fetchUserMock.mockResolvedValue({ ...stored.user, name: 'Свежий' });
    const appStore = useAppStore();
    await appStore.bootstrap();

    await appStore.recheck();

    expect(fetchUserMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore().user?.name).toBe('Свежий');
  });
});
