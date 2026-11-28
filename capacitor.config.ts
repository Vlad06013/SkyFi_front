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
      // Бэк отдаёт архив по http. У плагина httpsOnly включён по умолчанию,
      // и он отклоняет ссылку ещё до запроса.
      httpsOnly: false,
    },
    // Иконка шторки — белый силуэт в res/drawable. Без неё Android
    // ставит системный «восклицательный» ic_dialog_info.
    LocalNotifications: {
      smallIcon: 'ic_stat_skyfi',
      iconColor: '#1ED760',
    },
  },
};

export default config;