import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { getSession } from '@/lib/session';
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
 * API-префикса и отвечает сырым `{auth}` вне обёртки `{errors,data}` —
 * наш axios-интерцептор разворачивает `data.data`, поэтому здесь голый
 * fetch (токен берём из сессии; подхватывается и появившийся после входа).
 * Проверено curl'ом 2026-11-20: `POST {origin}/broadcasting/auth` → `{auth}`.
 */
export function createEcho(): Echo<'reverb'> {
  const key = import.meta.env.VITE_REVERB_APP_KEY;
  if (!key) {
    throw new Error(
      'VITE_REVERB_APP_KEY не задан в окружении — проверь .env (см. env_example) и перезапусти dev-сервер.',
    );
  }

  const useTls = scheme === 'https';
  console.info(`[realtime] подключение к ${useTls ? 'wss' : 'ws'}://${host}:${port} (app ${key})`);

  return new Echo({
    broadcaster: 'reverb',
    key,
    Pusher,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: useTls,
    enabledTransports: ['ws', 'wss'],
    disableStats: true,

    authEndpoint: `${apiUrl.origin}/broadcasting/auth`,

    authorizer: (channel) => ({
      authorize: (socketId, callback) => {
        void (async () => {
          try {
            const stored = await getSession();
            const response = await fetch(`${apiUrl.origin}/broadcasting/auth`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(stored?.token ? { Authorization: `Bearer ${stored.token}` } : {}),
              },
              body: JSON.stringify({ socket_id: socketId, channel_name: channel.name }),
            });
            if (!response.ok) throw new Error(`broadcasting/auth: HTTP ${response.status}`);
            callback(null, await response.json());
          } catch (error) {
            // Без этого лога провал handshake виден только как «сокет молчит».
            console.warn('[realtime] broadcasting/auth провален:', error);
            callback(error instanceof Error ? error : new Error('Broadcasting auth failed.'), null);
          }
        })();
      },
    }),
  });
}
