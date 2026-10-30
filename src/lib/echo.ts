
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

const host = import.meta.env.VITE_REVERB_HOST;
const port = Number(import.meta.env.VITE_REVERB_PORT || 8081);
const scheme = import.meta.env.VITE_REVERB_SCHEME || 'http';

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

    // Авторизация приватного канала через Laravel Sanctum.
    // Предполагается, что твой API-клиент использует cookie-аутентификацию.
    // authEndpoint: `${import.meta.env.VITE_API_URL}broadcasting/auth`,
    authEndpoint:  'http://31.128.42.183:8080/broadcasting/auth',

    auth: {
        headers: {
            Authorization: `Bearer ${localStorage.getItem('skyfi_token') ?? ''}`,
        },
    },
    withCredentials: true,
});

export default echo;
