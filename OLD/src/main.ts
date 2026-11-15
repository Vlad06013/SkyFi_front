import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';

import App from './App.vue';
import router from './router';

// Core CSS required for Ionic components to work properly
import '@ionic/vue/css/core.css';

// Basic CSS for apps built with Ionic
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';

// Optional CSS utilities
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/float-elements.css';
import '@ionic/vue/css/text-alignment.css';
import '@ionic/vue/css/text-transformation.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';

// Ionic Dark Mode
import '@ionic/vue/css/palettes/dark.system.css';

// Theme variables
import './theme/variables.css';

// Создаём приложение
const app = createApp(App);

// Подключаем плагины
app.use(createPinia());
app.use(IonicVue);
app.use(router);

// Монтируем приложение после готовности роутера
router.isReady().then(() => {
  app.mount('#app');
});
