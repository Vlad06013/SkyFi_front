import axios from 'axios';

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