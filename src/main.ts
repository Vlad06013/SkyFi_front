import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';

import App from './App.vue';
import router from './router';

import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';

import './styles/tokens.css';
import './styles/kit.css';
import './styles/base.css';
import './styles/app.css';
import './styles/adaptive.css';

const app = createApp(App);

app.use(createPinia());
app.use(IonicVue, { mode: 'md' });
app.use(router);

router.isReady().then(() => {
  app.mount('#app');
});
