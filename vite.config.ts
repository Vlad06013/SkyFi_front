/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import basicSsl from '@vitejs/plugin-basic-ssl'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // HTTPS нужен для getUserMedia (сканер QR): браузер даёт доступ к камере
    // только в secure context (https или localhost). Без него на телефоне
    // по http://192.168.x.x разрешение не запрашивается вовсе.
    basicSsl(),
    vue(),
    legacy()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.spec.ts'],
  }
})
