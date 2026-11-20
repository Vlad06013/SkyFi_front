import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';

import App from './App.vue';
import router from './router';
import { onUnauthorized } from '@/api/http';
import { bindSessionRealtime } from '@/realtime';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { useDevicesStore } from '@/stores/devices';
import { useOnlineStore } from '@/stores/online';

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
void appStore.bootstrap().finally(() => {
  void useOnlineStore(pinia).startPolling();
  // Session-scoped сервисы: presence устройства + сокеты (docs/plan-sockets.md).
  useDevicesStore(pinia).bindPresence();
  bindSessionRealtime();
});
