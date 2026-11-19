import { defineComponent, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@/api/http';
import { confirmQrLogin } from '@/api/qr';
import { useToastStore } from '@/stores/toast';

type State = 'ready' | 'done' | 'invalid';

export default defineComponent({
  name: 'QrConfirmPage',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const toast = useToastStore();

    const code = typeof route.query.code === 'string' ? route.query.code : '';
    const state = ref<State>(code ? 'ready' : 'invalid');
    const pending = ref(false);

    // Без кода подтверждать нечего — сразу домой (по плану этапа).
    if (!code) void router.replace('/home');

    async function confirm() {
      if (pending.value || !code) return;
      pending.value = true;
      try {
        await confirmQrLogin(code);
        state.value = 'done';
        toast.show('Вход подтверждён');
      } catch (error) {
        // Код истёк, подтверждён или невалиден — просим свежий.
        if (error instanceof ApiError && error.status === 404) {
          state.value = 'invalid';
          return;
        }
        toast.show(error instanceof Error ? error.message : 'Не удалось подтвердить вход', '', true);
      } finally {
        pending.value = false;
      }
    }

    function goBack() {
      void router.back();
    }

    return { state, pending, confirm, goBack };
  },
});
