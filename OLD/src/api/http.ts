import axios from 'axios';

import {useNetworkStore} from '@/stores/network';

export const http = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    headers: {
        Accept: 'application/json',
        // 'Content-Type': 'application/json',
    },
    timeout: 15000,
});

http.interceptors.request.use((config) => {
    const token = localStorage.getItem('skyfi_token');

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

// Нет ответа (соединение отказало, таймаут) — считаем, что мы
// в офлайне: приложение переключается на скачанные треки.
// Любой ответ, даже ошибка HTTP, возвращает в онлайн.
http.interceptors.response.use(
    (response) => {
        useNetworkStore().markServerUp();
        return response;
    },
    (error: unknown) => {
        if (axios.isAxiosError(error) && !error.response) {
            useNetworkStore().markServerDown();
        }

        return Promise.reject(error);
    },
);

