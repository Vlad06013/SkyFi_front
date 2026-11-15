
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

import { http } from '@/api/http';

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

    // Кастомный авторизатор вместо статичного заголовка: наш axios-интерцептор
    // подставляет Bearer-токен на каждый запрос, поэтому токен, появившийся
    // после регистрации или входа, подхватится автоматически.
    authorizer: (channel) => ({
        authorize: (socketId, callback) => {
            http.post(`${apiUrl.origin}/broadcasting/auth`, {
                socket_id: socketId,
                channel_name: channel.name,
            })
                .then((response) => callback(null, response.data))
                .catch((error: unknown) => {
                    callback(
                        error instanceof Error
                            ? error
                            : new Error('Broadcasting auth failed.'),
                        null,
                    );
                });
        },
    }),
});

export default echo;
