import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import * as authApi from '@/api/auth';
import * as session from '@/lib/session';
import { ApiError } from '@/api/http';
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

const loginMock = vi.mocked(authApi.login);
const registerMock = vi.mocked(authApi.register);
const fetchUserMock = vi.mocked(authApi.fetchUser);
const logoutMock = vi.mocked(authApi.logout);
const updateProfileMock = vi.mocked(authApi.updateProfile);
const uploadAvatarMock = vi.mocked(authApi.uploadAvatar);
const deleteAvatarMock = vi.mocked(authApi.deleteAvatar);
const getSessionMock = vi.mocked(session.getSession);
const setSessionMock = vi.mocked(session.setSession);
const clearSessionMock = vi.mocked(session.clearSession);

const payload = {
  token: 't1',
  user: { id: 1, name: 'Влад', email: 'vlad@mail.ru', avatar_url: null },
};

describe('stores/auth', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('login: состояние + сессия сохранены', async () => {
    loginMock.mockResolvedValue(payload);
    const auth = useAuthStore();

    await auth.login('vlad@mail.ru', 'secret');

    expect(auth.isAuthed).toBe(true);
    expect(auth.token).toBe('t1');
    expect(setSessionMock).toHaveBeenCalledWith({ token: 't1', user: payload.user });
  });

  it('login пробрасывает ApiError наружу без сессии', async () => {
    const error = new ApiError(401, 'auth', 'Не авторизован.');
    loginMock.mockRejectedValue(error);
    const auth = useAuthStore();

    await expect(auth.login('a@b.c', 'wrong')).rejects.toBe(error);
    expect(auth.isAuthed).toBe(false);
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it('register: шлёт password_confirmation', async () => {
    registerMock.mockResolvedValue(payload);
    const auth = useAuthStore();

    await auth.register('Влад', 'vlad@mail.ru', 'secret123', 'secret123');

    expect(registerMock).toHaveBeenCalledWith({
      name: 'Влад',
      email: 'vlad@mail.ru',
      password: 'secret123',
      password_confirmation: 'secret123',
    });
    expect(auth.isAuthed).toBe(true);
  });

  it('logout: API + локальная очистка даже при сетевой ошибке', async () => {
    logoutMock.mockRejectedValue(new ApiError(null, 'network', 'Нет соединения.'));
    getSessionMock.mockResolvedValue(payload);
    const auth = useAuthStore();
    await auth.restoreSession({ refresh: false });

    await auth.logout();

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(auth.isAuthed).toBe(false);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });

  it('restoreSession без refresh: гидратация без сети', async () => {
    getSessionMock.mockResolvedValue(payload);
    const auth = useAuthStore();

    await auth.restoreSession({ refresh: false });

    expect(auth.isAuthed).toBe(true);
    expect(auth.user).toEqual(payload.user);
    expect(fetchUserMock).not.toHaveBeenCalled();
  });

  it('restoreSession с refresh: свежий профиль', async () => {
    getSessionMock.mockResolvedValue(payload);
    fetchUserMock.mockResolvedValue({ ...payload.user, name: 'Свежий' });
    const auth = useAuthStore();

    await auth.restoreSession({ refresh: true });

    expect(auth.user?.name).toBe('Свежий');
    expect(setSessionMock).toHaveBeenCalledWith({ token: 't1', user: expect.objectContaining({ name: 'Свежий' }) });
  });

  it('restoreSession: 401 при refresh — сброс', async () => {
    getSessionMock.mockResolvedValue(payload);
    fetchUserMock.mockRejectedValue(new ApiError(401, 'auth', 'Не авторизован.'));
    const auth = useAuthStore();

    await auth.restoreSession({ refresh: true });

    expect(auth.isAuthed).toBe(false);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });

  it('restoreSession: сетевая ошибка при refresh — живём на сохранённом', async () => {
    getSessionMock.mockResolvedValue(payload);
    fetchUserMock.mockRejectedValue(new ApiError(null, 'network', 'Нет соединения.'));
    const auth = useAuthStore();

    await auth.restoreSession({ refresh: true });

    expect(auth.isAuthed).toBe(true);
    expect(auth.user).toEqual(payload.user);
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it('rename/uploadAvatar/removeAvatar обновляют профиль и сессию', async () => {
    getSessionMock.mockResolvedValue(payload);
    const auth = useAuthStore();
    await auth.restoreSession({ refresh: false });

    updateProfileMock.mockResolvedValue({ ...payload.user, name: 'Новый' });
    await auth.rename('Новый');
    expect(auth.user?.name).toBe('Новый');

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    uploadAvatarMock.mockResolvedValue({ ...payload.user, avatar_url: 'https://img/a.png' });
    await auth.uploadAvatar(file);
    expect(auth.user?.avatar_url).toBe('https://img/a.png');
    expect(uploadAvatarMock).toHaveBeenCalledWith(file);

    deleteAvatarMock.mockResolvedValue(payload.user);
    await auth.removeAvatar();
    expect(auth.user?.avatar_url).toBeNull();

    expect(setSessionMock).toHaveBeenCalled();
  });

  it('applyQrSession: применяет AuthPayload из QR-поллинга', async () => {
    const auth = useAuthStore();
    await auth.applyQrSession({ token: 'qr-token', user: payload.user });
    expect(auth.token).toBe('qr-token');
    expect(auth.isAuthed).toBe(true);
    expect(setSessionMock).toHaveBeenCalledWith({ token: 'qr-token', user: payload.user });
  });
});
