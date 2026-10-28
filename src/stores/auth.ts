import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios';

import {
    loginRequest,
    registerRequest,
    getCurrentUserRequest,
    logoutRequest,
} from '@/api/auth';

import type { User } from '@/types/AuthType';
import { invalidatePlaylistsCache } from '@/api/playlists';

export const useAuthStore = defineStore('auth', () => {
    const user = ref<User | null>(null);

    const token = ref<string | null>(
        localStorage.getItem('skyfi_token'),
    );

    const initialized = ref(false);
    const isLoading = ref(false);
    const error = ref('');

    const isAuthenticated = computed(
        () => !!token.value && !!user.value,
    );

    function clearAuth() {
        token.value = null;
        user.value = null;

        localStorage.removeItem('skyfi_token');

        invalidatePlaylistsCache();
    }

    function setAuth(data: {
        user: User;
        token: string;
    }) {
        token.value = data.token;
        user.value = data.user;

        localStorage.setItem('skyfi_token', data.token);
    }

    function getErrorMessage(exception: unknown): string {
        if (axios.isAxiosError(exception)) {
            const data = exception.response?.data;

            if (data?.errors) {
                const firstError = Object.values(
                    data.errors as Record<string, unknown>,
                )
                    .flat()
                    .find(
                        (value): value is string =>
                            typeof value === 'string',
                    );

                if (firstError) {
                    return firstError;
                }
            }

            if (exception.response?.status === 401) {
                return 'Неверный email или пароль.';
            }

            if (!exception.response) {
                return 'Не удалось подключиться к серверу.';
            }

            return (
                data?.message
                ?? 'Произошла ошибка. Попробуй ещё раз.'
            );
        }

        return 'Произошла непредвиденная ошибка.';
    }

    async function login(
        email: string,
        password: string,
    ): Promise<boolean> {
        isLoading.value = true;
        error.value = '';

        try {
            const response = await loginRequest({
                email,
                password,
            });

            setAuth(response.data);

            return true;
        } catch (exception) {
            error.value = getErrorMessage(exception);
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    async function register(
        name: string,
        email: string,
        password: string,
        passwordConfirmation: string,
    ): Promise<boolean> {
        isLoading.value = true;
        error.value = '';

        try {
            const response = await registerRequest({
                name,
                email,
                password,
                password_confirmation: passwordConfirmation,
            });

            setAuth(response.data);

            return true;
        } catch (exception) {
            error.value = getErrorMessage(exception);
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    async function fetchUser(): Promise<boolean> {
        if (!token.value) {
            user.value = null;
            return false;
        }

        try {
            const response = await getCurrentUserRequest();

            user.value = response.data.user;

            return true;
        } catch (exception) {
            if (
                axios.isAxiosError(exception)
                && exception.response?.status === 401
            ) {
                clearAuth();
            } else {
                console.error(
                    'Не удалось получить пользователя:',
                    exception,
                );
            }

            user.value = null;
            return false;
        }
    }

    async function initialize(): Promise<void> {
        if (initialized.value) return;

        try {
            if (token.value) {
                await fetchUser();
            }
        } finally {
            initialized.value = true;
        }
    }

    async function logout(): Promise<void> {
        try {
            if (token.value) {
                await logoutRequest();
            }
        } catch (exception) {
            console.error(
                'Ошибка выхода на сервер:',
                exception,
            );
        } finally {
            clearAuth();
            initialized.value = true;
        }
    }

    return {
        user,
        token,
        initialized,
        isLoading,
        error,
        isAuthenticated,
        login,
        register,
        logout,
        initialize,
    };
});
