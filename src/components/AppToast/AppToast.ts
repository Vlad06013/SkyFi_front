import { defineComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { useToastStore } from '@/stores/toast';

export default defineComponent({
  name: 'AppToast',
  setup() {
    const toastStore = useToastStore();
    const { toast } = storeToRefs(toastStore);

    return { toast, runAction: toastStore.runAction };
  },
});
