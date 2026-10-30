
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

/*
 * Хост WebSocket-сервера берём из VITE_API_URL, чтобы не
 * дублировать адрес сервера в отдельных переменных.
 * При необходимости можно переопределить через VITE_REVERB_*.
 */

const apiUrl = new URL(import.meta.env.VITE_API_URL);

const host = import.meta.env.VITE_REVERB_HOST ?? apiUrl.hostname;

const port = Number(
    import.meta.env.VITE_REVERB_PORT
        ?? (apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80)),
);

const scheme = import.meta.env.VITE_REVERB_SCHEME
    ?? apiUrl.protocol.replace(':', '');

const echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    Pusher,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    disableStats: true,

    // Авторизация приватных каналов на том же хосте, что и API.
    authEndpoint: `${apiUrl.origin}/broadcasting/auth`,

    auth: {
        headers: {
            Authorization: `Bearer ${localStorage.getItem('skyfi_token') ?? ''}`,
        },
    },
    withCredentials: true,
});

export default echo;
