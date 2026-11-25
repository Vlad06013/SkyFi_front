import { defineComponent } from 'vue';
import { IonApp } from '@ionic/vue';
import AppConfirm from '@/components/AppConfirm/AppConfirm.vue';
import AppSplash from '@/components/AppSplash/AppSplash.vue';
import AppToast from '@/components/AppToast/AppToast.vue';
import { useAppStore } from '@/stores/app';
import { useOnlineRestoreToast } from '@/composables/useOnlineRestoreToast';
import { useApkBuildStore } from '@/stores/apk-build';
import { bindHardwareBack, confirmExit, exitPromptOpen } from '@/lib/hardware-back';

export default defineComponent({
  name: 'App',
  components: { IonApp, AppConfirm, AppSplash, AppToast },
  setup() {
    const app = useAppStore();
    // Тост «Соединение восстановлено» при переходе офлайн → онлайн.
    useOnlineRestoreToast();
    useApkBuildStore().watchApk();
    bindHardwareBack();
    return { app, exitPromptOpen, confirmExit };
  },
});
