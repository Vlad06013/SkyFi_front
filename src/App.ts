import { defineComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { IonApp } from '@ionic/vue';
import AppConfirm from '@/components/AppConfirm/AppConfirm.vue';
import AppSplash from '@/components/AppSplash/AppSplash.vue';
import AppToast from '@/components/AppToast/AppToast.vue';
import { useAppStore } from '@/stores/app';
import { useOnlineRestoreToast } from '@/composables/useOnlineRestoreToast';
import { useAppUpdateStore } from '@/stores/app-update';
import { bindHardwareBack, confirmExit, exitPromptOpen, pushBackOverlay } from '@/lib/hardware-back';

export default defineComponent({
  name: 'App',
  components: { IonApp, AppConfirm, AppSplash, AppToast },
  setup() {
    const app = useAppStore();
    // Тост «Соединение восстановлено» при переходе офлайн → онлайн.
    useOnlineRestoreToast();
    const updates = useAppUpdateStore();
    updates.bind();
    pushBackOverlay(() => {
      if (!updates.promptOpen) return false;
      updates.dismiss();
      return true;
    });
    const {
      promptOpen: updatePromptOpen,
      promptTitle: updateTitle,
      promptMessage: updateMessage,
      mandatory: updateMandatory,
      downloading: updateDownloading,
    } = storeToRefs(updates);
    bindHardwareBack();
    return {
      app,
      exitPromptOpen,
      confirmExit,
      updatePromptOpen,
      updateTitle,
      updateMessage,
      updateMandatory,
      updateDownloading,
      applyUpdate: () => void updates.accept(),
      dismissUpdate: updates.dismiss,
    };
  },
});
