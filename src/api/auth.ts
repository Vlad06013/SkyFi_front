import { http } from '@/api/http';


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
