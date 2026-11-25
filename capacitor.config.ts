import type { CapacitorConfig } from '@capacitor/cli';
import { BUNDLE_VERSION } from './src/lib/bundle-version';

const config: CapacitorConfig = {
  appId: 'com.skyfi.app',
  appName: 'SkyFi',
  webDir: 'dist',
  server: {
    androidScheme: 'http'
  },
  plugins: {
    // Свой бэк, без сервера Capgo: бандл качаем сами из /app-updates.
    CapacitorUpdater: {
      autoUpdate: false,
      version: BUNDLE_VERSION,
    },
  },
};

export default config;