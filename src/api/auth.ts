import { http } from '@/api/http';
import { ApiResponse } from '@/types/TypeApiRespone';
import { User, AuthResponse, LoginPayload, RegisterPayload } from '@/types/AuthType';


/**
 * Запускает авторизацию Яндекс Музыки через код подтверждения.
 */
export async function startYandexMusicDeviceAuth() {
    const response = await http.post(
        'yandex-music/auth/device/start',
    );

    return response.data as {
        session_id: string;
        status: string;
        verification_url: string | null;
        user_code: string | null;
    };
}

/**
 * Проверяет статус авторизации.
 * Токен Яндекс Музыки клиенту не возвращается.
 */
export async function getYandexMusicDeviceAuthStatus() {
    const response = await http.get(
        'yandex-music/auth/device/status',
    );

    return response.data as {
        status: string;
        connected: boolean;
        verification_url?: string | null;
        user_code?: string | null;
        message?: string;
    };
}

/**
 * Отключает Яндекс Музыку для текущего пользователя SkyFi.
 */
export async function disconnectYandexMusic() {
    const response = await http.delete(
        'yandex-music/auth',
    );

    return response.data as {
        connected: boolean;
        message: string;
    };
}

export async function loginRequest(
    payload: LoginPayload,
) {
    return (await http.post<ApiResponse<AuthResponse>>(
        '/login',
        payload,
    )).data;
}

export async function registerRequest(
    payload: RegisterPayload,
) {
    return (await http.post<ApiResponse<AuthResponse>>(
        '/register',
        payload,
    )).data;
}

export async function getCurrentUserRequest() {
    return (
        await http.get<ApiResponse<{ user: User }>>('/user')
    ).data;
}

export async function logoutRequest() {
    return http.post('/logout');
}