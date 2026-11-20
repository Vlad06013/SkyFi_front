import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { httpRaw } from '@/api/http';
/*
 * Хост WebSocket-сервера берём из VITE_API_URL, чтобы не дублировать
 * адрес сервера в отдельных переменных. При необходимости можно
 * переопределить через VITE_REVERB_*.
 */

const apiUrl = new URL(import.meta.env.VITE_API_URL);

const host = import.meta.env.VITE_REVERB_HOST ?? apiUrl.hostname;

const port = Number(
  import.meta.env.VITE_REVERB_PORT ?? (apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80)),
);

const scheme = import.meta.env.VITE_REVERB_SCHEME ?? apiUrl.protocol.replace(':', '');

/**
 * Echo + Reverb (api.md §17). Handshake `/broadcasting/auth` живёт вне
 * API-префикса и вне обёртки `{errors,data}` — авторизуемся сырым axios
 * с тем же Bearer (интерцептор подставит токен автоматически).
 * Проверено curl'ом 2026-11-20: `POST {origin}/broadcasting/auth` → `{auth}`.
 */
export function createEcho(): Echo<'reverb'> {
  const key = import.meta.env.VITE_REVERB_APP_KEY;
  if (!key) throw new Error('VITE_REVERB_APP_KEY не задан в окружении.');

  return new Echo({
    broadcaster: 'reverb',
    key,
    Pusher,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    disableStats: true,

    authEndpoint: `${apiUrl.origin}/broadcasting/auth`,

    // Кастомный авторизатор вместо статичного заголовка: axios-интерцептор
    // подставляет Bearer на каждый запрос, поэтому токен, появившийся после
    // входа, подхватится автоматически.
    authorizer: (channel) => ({
      authorize: (socketId, callback) => {
        httpRaw
          .post(`${apiUrl.origin}/broadcasting/auth`, {
            socket_id: socketId,
            channel_name: channel.name,
          })
          .then((response) => callback(null, response.data))
          .catch((error: unknown) => {
            callback(error instanceof Error ? error : new Error('Broadcasting auth failed.'), null);
          });
      },
    }),
  });
}
