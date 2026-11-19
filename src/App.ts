import { defineComponent } from 'vue';
import { IonApp } from '@ionic/vue';
import AppSplash from '@/components/AppSplash/AppSplash.vue';
import { useAppStore } from '@/stores/app';

export default defineComponent({
  name: 'App',
  components: { IonApp, AppSplash },
  setup() {
    const app = useAppStore();
    return { app };
  },
});
