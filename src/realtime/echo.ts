import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { currentEndpoint } from '@/lib/endpoints';
import { getSession } from '@/lib/session';
/*
 * Куда стучаться, решает lib/endpoints: внешний адрес или домашняя пара
 * VITE_*_LOCAL. Здесь только чтение уже выбранной пары.
 *
 * VITE_REVERB_PROXY=true и только dev: страница https, а Reverb на бэке
 * plain ws — прямое ws:// с https-страницы заблокировано бы как mixed
 * content. Подключаемся на сам dev-сервер (wss://localhost:5173), vite
 * проксирует на Reverb (см. server.proxy в vite.config.ts). В APK флаг
 * не действует: сокет идёт напрямую на выбранный адрес.
 */

function socketTarget(): { host: string; port: number; scheme: string; authUrl: string } {
  const proxySockets = import.meta.env.DEV && import.meta.env.VITE_REVERB_PROXY === 'true';
  if (proxySockets) {
    return {
      host: window.location.hostname,
      port: Number(window.location.port || (window.location.protocol === 'https:' ? 443 : 80)),
      scheme: window.location.protocol.replace(':', ''),
      authUrl: '/broadcasting/auth',
    };
  }
  const endpoint = currentEndpoint();
  const api = new URL(endpoint.apiUrl);
  return {
    host: endpoint.reverbHost,
    port: endpoint.reverbPort,
    scheme: endpoint.reverbScheme,
    authUrl: `${api.origin}/broadcasting/auth`,
  };
}

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

  const target = socketTarget();
  const useTls = target.scheme === 'https';
  console.info(`[realtime] подключение к ${useTls ? 'wss' : 'ws'}://${target.host}:${target.port} (app ${key})`);

  return new Echo({
    broadcaster: 'reverb',
    key,
    Pusher,
    wsHost: target.host,
    wsPort: target.port,
    wssPort: target.port,
    forceTLS: useTls,
    enabledTransports: ['ws', 'wss'],
    disableStats: true,
    // Мёртвый сокет без FIN (контейнер реверба остановлен за DNAT докера —
    // соединение «подвисает» наполовину) дефолтный activity_timeout pusher'а
    // (~2 мин) замечает слишком поздно: бэк через 60 с тишины сокета сам
    // ставит стоп (api.md §4). Пингуем чаще: детект за ~20 с, реконнект
    // успевает в серверный грейс.
    activity_timeout: 15_000,
    pong_timeout: 5_000,

    authEndpoint: target.authUrl,

    authorizer: (channel) => ({
      authorize: (socketId, callback) => {
        void (async () => {
          try {
            const stored = await getSession();
            const response = await fetch(target.authUrl, {
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
