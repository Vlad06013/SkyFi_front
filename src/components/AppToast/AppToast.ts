import { defineComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { useToastStore } from '@/stores/toast';

export default defineComponent({
  name: 'AppToast',
  setup() {
    const { toast } = storeToRefs(useToastStore());

    return { toast };
  },
});
