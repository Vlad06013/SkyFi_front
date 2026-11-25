import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';

import App from './App.vue';
import router from './router';
import { onUnauthorized } from '@/api/http';
import { bindSessionRealtime } from '@/realtime';
import { useAudioPlayback } from '@/composables/useAudioPlayback';
import { bindMediaKeys } from '@/lib/media-keys';
import { useStreamPrefetch } from '@/composables/useStreamPrefetch';
import { getClipVideoElement, useVideoPlayback } from '@/composables/useVideoPlayback';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { useDevicesStore } from '@/stores/devices';
import { useOnlineStore } from '@/stores/online';
import { resolveEndpoint } from '@/lib/endpoints';
import { hydrateStreamCache } from '@/lib/stream-url-cache';
import { useDownloadsStore } from '@/stores/downloads';
import { usePlayerStore } from '@/stores/player';

import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';

import './styles/tokens.css';
import './styles/kit.css';
import './styles/base.css';
import './styles/app.css';
import './styles/adaptive.css';

if (Capacitor.isNativePlatform()) {
  // Битый бандл без этого отката плагин откатит сам. Звать до сети:
  // таймаут плагина короткий, bootstrap его не ждёт.
  void CapacitorUpdater.notifyAppReady();
}

if (Capacitor.getPlatform() === 'android') {
  // Пока нативный инсет не доехал, колокольчик не должен сидеть на батарее.
  // Точное значение потом пишет MainActivity в те же переменные.
  document.documentElement.style.setProperty('--safe-top', '32px');
  document.documentElement.style.setProperty('--safe-bottom', '24px');
}

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(IonicVue, { mode: 'md' });
app.use(router);

onUnauthorized(() => {
  const auth = useAuthStore(pinia);
  void auth.reset().then(() => router.replace('/login'));
});

app.mount('#app');

const appStore = useAppStore(pinia);
// До первого запроса: домашний Wi‑Fi не открывает внешний адрес бэка.
void resolveEndpoint().finally(() => {
  void appStore.bootstrap().finally(async () => {
    void useOnlineStore(pinia).startPolling();
    // Session-scoped сервисы: presence устройства + сокеты (docs/plan-sockets.md).
    useDevicesStore(pinia).bindPresence();
    bindSessionRealtime();
    // Ссылки get-url из прошлой сессии — до движка, иначе он запросит текущий трек заново.
    await hydrateStreamCache();
    await useDownloadsStore(pinia).hydrate();
    // Плеер: серверное состояние + реконнект-рефетч + аудио-движок (docs/plan-player.md).
    usePlayerStore(pinia).bindServerPlayback();
    useAudioPlayback();
    bindMediaKeys();
    useVideoPlayback();
    // Предзагрузка stream URL: 2 трека вперёд/назад, только на активном (§9).
    useStreamPrefetch();
    // DEV-диагностика: доступ из консоли (window.__player/__devices/__clipVideo).
    if (import.meta.env.DEV) {
      (window as unknown as { __player: ReturnType<typeof usePlayerStore> }).__player = usePlayerStore(pinia);
      (window as unknown as { __devices: ReturnType<typeof useDevicesStore> }).__devices = useDevicesStore(pinia);
      (window as unknown as { __clipVideo: () => HTMLVideoElement | null }).__clipVideo = () =>
        getClipVideoElement();
    }
  });
});
