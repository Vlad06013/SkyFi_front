import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios';
import { http } from '@/api/http';

export interface User {
    id: number;
    name: string;
    email: string;
}

interface AuthResponse {
    user: User;
    token: string;
    message?: string;
}

export const useAuthStore = defineStore('auth', () => {
    const user = ref<User | null>(null);
    const token = ref<string | null>(
        localStorage.getItem('skyfi_token'),
    );

    const initialized = ref(false);
    const isLoading = ref(false);
    const error = ref('');

    const isAuthenticated = computed(() => {
        return !!token.value && !!user.value;
    });

    function clearAuth() {
        token.value = null;
        user.value = null;

        localStorage.removeItem('skyfi_token');
    }

    function getErrorMessage(exception: unknown): string {
        if (axios.isAxiosError(exception)) {
            const data = exception.response?.data;

            if (data?.errors) {
                const firstError = Object.values(data.errors)
                    .flat()
                    .find((value) => typeof value === 'string');

                if (firstError) {
                    return firstError as string;
                }
            }

            if (exception.response?.status === 401) {
                return 'Неверный email или пароль.';
            }

            if (!exception.response) {
                return 'Не удалось подключиться к серверу.';
            }

            return data?.message ?? 'Произошла ошибка. Попробуй ещё раз.';
        }

        return 'Произошла непредвиденная ошибка.';
    }

    async function login(email: string, password: string) {
        isLoading.value = true;
        error.value = '';

        try {
            const response = await http.post<AuthResponse>(
                '/login',
                { email, password },
            );

            token.value = response.data.token;
            user.value = response.data.user;

            localStorage.setItem('skyfi_token', response.data.token);

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
    ) {
        isLoading.value = true;
        error.value = '';

        try {
            const response = await http.post<AuthResponse>(
                '/register',
                {
                    name,
                    email,
                    password,
                    password_confirmation: passwordConfirmation,
                },
            );

            token.value = response.data.token;
            user.value = response.data.user;

            localStorage.setItem('skyfi_token', response.data.token);

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
            const response = await http.get<{ user: User }>('/user');

            user.value = response.data.user;

            return true;
        } catch (exception) {
            if (
                axios.isAxiosError(exception) &&
                exception.response?.status === 401
            ) {
                // Токен недействителен или отозван.
                clearAuth();
            } else {
                // При временной ошибке сохраняем токен.
                console.error(
                    'Не удалось получить пользователя:',
                    exception,
                );
            }

            user.value = null;
            return false;
        }
    }

    async function initialize() {
        if (initialized.value) return;

        if (token.value) {
            await fetchUser();
        }

        initialized.value = true;
    }

    async function logout() {
        try {
            if (token.value) {
                await http.post('/logout');
            }
        } catch (exception) {
            console.error('Ошибка выхода на сервер:', exception);
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