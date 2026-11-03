import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.skyfi.app',
  appName: 'SkyFi',
  webDir: 'dist',
  server: {
    androidScheme: 'http'
  }
};

export default config;