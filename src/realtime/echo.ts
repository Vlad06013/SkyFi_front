import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { getSession } from '@/lib/session';
/*
 * Хост WebSocket-сервера берём из VITE_API_URL, чтобы не дублировать
 * адрес сервера в отдельных переменных. При необходимости можно
 * переопределить через VITE_REVERB_*.
 *
 * VITE_REVERB_PROXY=true (dev): страница https, а Reverb на бэке plain
 * ws — прямое ws:// с https-страницы заблокировано бы как mixed content.
 * Подключаемся на сам dev-сервер (wss://localhost:5173), vite проксирует
 * на Reverb (см. server.proxy в vite.config.ts). В проде флаг выключен —
 * прямое подключение по VITE_REVERB_*.
 */

const apiUrl = new URL(import.meta.env.VITE_API_URL);
const proxySockets = import.meta.env.VITE_REVERB_PROXY === 'true';

const host = proxySockets
  ? window.location.hostname
  : (import.meta.env.VITE_REVERB_HOST ?? apiUrl.hostname);

const port = proxySockets
  ? Number(window.location.port || (window.location.protocol === 'https:' ? 443 : 80))
  : Number(
      import.meta.env.VITE_REVERB_PORT ?? (apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80)),
    );

const scheme = proxySockets
  ? window.location.protocol.replace(':', '')
  : (import.meta.env.VITE_REVERB_SCHEME ?? apiUrl.protocol.replace(':', ''));

/** Handshake вне API-префикса и вне обёртки {errors,data}; в режиме прокси — на сам dev-сервер. */
const authUrl = proxySockets ? '/broadcasting/auth' : `${apiUrl.origin}/broadcasting/auth`;

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

    authEndpoint: authUrl,

    authorizer: (channel) => ({
      authorize: (socketId, callback) => {
        void (async () => {
          try {
            const stored = await getSession();
            const response = await fetch(authUrl, {
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
