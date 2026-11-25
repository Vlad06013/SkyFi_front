import { defineComponent } from 'vue';
import { IonApp } from '@ionic/vue';
import AppSplash from '@/components/AppSplash/AppSplash.vue';
import AppToast from '@/components/AppToast/AppToast.vue';
import { useAppStore } from '@/stores/app';
import { useOnlineRestoreToast } from '@/composables/useOnlineRestoreToast';
import { useApkBuildStore } from '@/stores/apk-build';

export default defineComponent({
  name: 'App',
  components: { IonApp, AppSplash, AppToast },
  setup() {
    const app = useAppStore();
    // Тост «Соединение восстановлено» при переходе офлайн → онлайн.
    useOnlineRestoreToast();
    useApkBuildStore().watchApk();
    return { app };
  },
});
