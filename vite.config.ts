/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import basicSsl from '@vitejs/plugin-basic-ssl'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const apiOrigin = new URL(env.VITE_API_URL).origin
  const reverbHost = env.VITE_REVERB_HOST || new URL(env.VITE_API_URL).hostname
  const reverbPort = env.VITE_REVERB_PORT || '8081'

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
        // на ws://VITE_REVERB_HOST:PORT. Активно при VITE_REVERB_PROXY=true.
        '/app': { target: `ws://${reverbHost}:${reverbPort}`, ws: true, changeOrigin: true },
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
