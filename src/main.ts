import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';

import App from './App.vue';
import router from './router';
import { onUnauthorized } from '@/api/http';
import { bindSessionRealtime } from '@/realtime';
import { useAudioPlayback } from '@/composables/useAudioPlayback';
import { useStreamPrefetch } from '@/composables/useStreamPrefetch';
import { getClipVideoElement, useVideoPlayback } from '@/composables/useVideoPlayback';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { useDevicesStore } from '@/stores/devices';
import { useOnlineStore } from '@/stores/online';
import { hydrateStreamCache } from '@/lib/stream-url-cache';
import { usePlayerStore } from '@/stores/player';

import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';

import './styles/tokens.css';
import './styles/kit.css';
import './styles/base.css';
import './styles/app.css';
import './styles/adaptive.css';

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
void appStore.bootstrap().finally(async () => {
  void useOnlineStore(pinia).startPolling();
  // Session-scoped сервисы: presence устройства + сокеты (docs/plan-sockets.md).
  useDevicesStore(pinia).bindPresence();
  bindSessionRealtime();
  // Ссылки get-url из прошлой сессии — до движка, иначе он запросит текущий трек заново.
  await hydrateStreamCache();
  // Плеер: серверное состояние + реконнект-рефетч + аудио-движок (docs/plan-player.md).
  usePlayerStore(pinia).bindServerPlayback();
  useAudioPlayback();
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
