import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AuthPayload, AuthUser } from '@/types';
import { ApiError } from '@/api/http';
import * as authApi from '@/api/auth';
import * as session from '@/lib/session';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const token = ref<string | null>(null);
  const restoring = ref(false);

  const isAuthed = computed(() => user.value !== null);

  async function applyAuth(payload: AuthPayload) {
    token.value = payload.token;
    user.value = payload.user;
    await session.setSession({ token: payload.token, user: payload.user });
  }

  async function login(email: string, password: string) {
    await applyAuth(await authApi.login(email, password));
  }

  async function register(name: string, email: string, password: string, passwordConfirmation: string) {
    await applyAuth(
      await authApi.register({ name, email, password, password_confirmation: passwordConfirmation }),
    );
  }

  /** Вход по токену из QR-поллинга (ТВ) — тот же AuthPayload. */
  async function applyQrSession(payload: AuthPayload) {
    await applyAuth(payload);
  }

  async function rename(name: string) {
    if (!user.value) return;
    user.value = await authApi.updateProfile(name);
    await persistUser();
  }

  async function uploadAvatar(file: File) {
    if (!user.value) return;
    user.value = await authApi.uploadAvatar(file);
    await persistUser();
  }

  async function removeAvatar() {
    if (!user.value) return;
    user.value = await authApi.deleteAvatar();
    await persistUser();
  }

  async function persistUser() {
    if (token.value && user.value) {
      await session.setSession({ token: token.value, user: user.value });
    }
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // Токен мог протухнуть раньше — локальный выход в любом случае.
    }
    await reset();
  }

  /**
   * Гидратация из хранилища. refresh=true (онлайн) — свежий
   * GET /user; 401 — токен мёртв, сброс. Сетевые/5xx — живём
   * на сохранённом профиле.
   */
  async function restoreSession(options: { refresh: boolean }) {
    restoring.value = true;
    try {
      const stored = await session.getSession();
      if (!stored) return;
      token.value = stored.token;
      user.value = stored.user;
      if (!options.refresh) return;
      try {
        user.value = await authApi.fetchUser();
        await persistUser();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) await reset();
      }
    } finally {
      restoring.value = false;
    }
  }

  async function reset() {
    token.value = null;
    user.value = null;
    await session.clearSession();
  }

  return {
    user,
    token,
    isAuthed,
    restoring,
    login,
    register,
    applyQrSession,
    rename,
    uploadAvatar,
    removeAvatar,
    logout,
    restoreSession,
    reset,
  };
});
