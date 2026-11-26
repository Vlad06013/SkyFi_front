/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import basicSsl from '@vitejs/plugin-basic-ssl'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'

const PUBLIC_IP_URL = 'https://api.ipify.org?format=json'

/**
 * Домашняя ли сеть у dev-машины — тем же способом, что и в клиенте
 * (lib/endpoints): внешний IP совпадает с хостом бэка. Цель прокси
 * выбирается один раз при старте, поэтому при смене сети dev-сервер
 * перезапускают. Сбой ipify = «не дома»; ручной override — VITE_IS_LOCAL_FORCE.
 */
async function recognizeHome(wanHost: string): Promise<boolean> {
  try {
    const response = await fetch(PUBLIC_IP_URL, { signal: AbortSignal.timeout(2_500) })
    if (!response.ok) return false
    const body = (await response.json()) as { ip?: unknown }
    return typeof body.ip === 'string' && body.ip.trim() === wanHost.trim()
  } catch {
    return false
  }
}

// https://vitejs.dev/config/
export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, process.cwd())
  const wanApi = new URL(env.VITE_API_URL)
  const localApi = env.VITE_API_URL_LOCAL ? new URL(env.VITE_API_URL_LOCAL) : null

  // Куда проксировать, решаем при старте dev-сервера: роутер не умеет
  // hairpin, поэтому с домашней машины внешний адрес бэка недоступен и
  // единственный рабочий путь — локальный. Сборке и тестам сеть не нужна.
  const forceLocal = env.VITE_IS_LOCAL_FORCE === 'true' && Boolean(localApi)
  const home =
    forceLocal ||
    (command === 'serve' && !process.env.VITEST && localApi !== null && (await recognizeHome(wanApi.hostname)))
  const apiUrl = home && localApi ? localApi : wanApi
  const apiOrigin = apiUrl.origin
  const reverbHost = home && localApi
    ? env.VITE_REVERB_HOST_LOCAL || localApi.hostname
    : env.VITE_REVERB_HOST || wanApi.hostname
  const reverbPort = home && localApi
    ? env.VITE_REVERB_PORT_LOCAL || localApi.port || '8081'
    : env.VITE_REVERB_PORT || '8081'

  return {
    plugins: [
      // HTTPS нужен для getUserMedia (сканер QR) и clipboard (копирование
      // кодов/ссылок): браузер даёт доступ только в secure context
      // (https или localhost). На LAN-адресе http://192.168.x.x не работает.
      basicSsl(),
      vue(),
      legacy()
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      proxy: {
        // Сокеты через dev-сервер: страница https, а Reverb на бэке plain ws —
        // прямое ws:// с https-страницы заблокировано бы как mixed content.
        // Клиент стучится в wss://localhost:5173/app/{key}, vite пересылает
        // на ws://REVERB_HOST:PORT. Активно при VITE_REVERB_PROXY=true.
        '/app': { target: `ws://${reverbHost}:${reverbPort}`, ws: true, changeOrigin: true },
        // API и медиа-ресурсы бэка (api.md §1.7): с https-страницы прямые
        // http://… запросы режутся как mixed content, поэтому клиент шлёт их
        // на dev-сервер, а vite пересылает на выбранную при старте пару.
        '/api': { target: apiOrigin, changeOrigin: true },
        '/yt-resource': { target: apiOrigin, changeOrigin: true },
        '/dzen-resource': { target: apiOrigin, changeOrigin: true },
        '/storage': { target: apiOrigin, changeOrigin: true },
        // Handshake приватных каналов тем же манером (вне API-префикса).
        '/broadcasting/auth': { target: apiOrigin, changeOrigin: true },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/unit/setup.ts'],
      include: ['tests/unit/**/*.spec.ts'],
    }
  }
})
