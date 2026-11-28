import { computed, defineComponent, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@/api/http';
import * as authApi from '@/api/auth';
import { useQrLogin } from '@/composables/useQrLogin';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'qr';

export default defineComponent({
  name: 'LoginPage',
  setup() {
    const router = useRouter();
    const route = useRoute();
    const auth = useAuthStore();
    const online = useOnlineStore();
    const app = useAppStore();
    const toast = useToastStore();
    const qr = useQrLogin();

    const mode = ref<Mode>('login');
    const name = ref('');
    const email = ref('');
    const password = ref('');
    const passwordConfirmation = ref('');
    /** «Глазик» — показ пароля в полях ввода. */
    const showPassword = ref(false);
    const showPasswordConfirmation = ref(false);
    const code = ref('');
    /** Email, на который ушёл код сброса — нужен в теле reset-password. */
    const resetEmail = ref('');
    const pending = ref(false);
    const fieldErrors = ref<Record<string, string[]>>({});

    const isOffline = computed(() => online.isOnline === false);

    function fieldMessage(key: string): string {
      return fieldErrors.value[key]?.[0] ?? '';
    }

    function switchMode(next: Mode) {
      fieldErrors.value = {};
      mode.value = next;
      if (next === 'qr') {
        if (isOffline.value) {
          toast.show('Нет соединения с сервером', '', true);
          return;
        }
        void qr.start();
      } else {
        qr.stop();
      }
    }

    // ТВ залогинилось по QR: применяем токен из поллинга.
    watch(qr.phase, async (value) => {
      if (value !== 'confirmed' || !qr.payload.value) return;
      await auth.applyQrSession(qr.payload.value);
      await router.replace('/home');
    });

    function guardOffline(): boolean {
      if (!isOffline.value) return false;
      toast.show('Нет соединения с сервером', '', true);
      return true;
    }

    function handleError(error: unknown) {
      if (error instanceof ApiError) {
        if (error.fields) fieldErrors.value = error.fields;
        // 422 с полями рисует подписи под инпутами, дублировать тостом не надо.
        if (!error.fields) toast.show(error.message, '', true);
        return;
      }
      toast.show('Что-то пошло не так', '', true);
    }

    async function submitLogin() {
      if (pending.value || guardOffline()) return;
      fieldErrors.value = {};
      pending.value = true;
      try {
        await auth.login(email.value, password.value);
        const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/home';
        await router.replace(redirect);
      } catch (error) {
        handleError(error);
      } finally {
        pending.value = false;
      }
    }

    async function submitRegister() {
      if (pending.value || guardOffline()) return;
      fieldErrors.value = {};
      pending.value = true;
      try {
        await auth.register(name.value, email.value, password.value, passwordConfirmation.value);
        const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/home';
        await router.replace(redirect);
      } catch (error) {
        handleError(error);
      } finally {
        pending.value = false;
      }
    }

    async function sendCode() {
      if (pending.value || guardOffline()) return;
      fieldErrors.value = {};
      pending.value = true;
      try {
        const response = await authApi.forgotPassword(email.value);
        resetEmail.value = email.value;
        toast.show(response?.message ?? 'Код отправлен на почту');
        switchMode('reset');
      } catch (error) {
        handleError(error);
      } finally {
        pending.value = false;
      }
    }

    async function submitReset() {
      if (pending.value || guardOffline()) return;
      fieldErrors.value = {};
      pending.value = true;
      try {
        await authApi.resetPassword({
          email: resetEmail.value,
          code: code.value,
          password: password.value,
          password_confirmation: passwordConfirmation.value,
        });
        password.value = '';
        passwordConfirmation.value = '';
        code.value = '';
        toast.show('Пароль обновлён', 'войдите с новым');
        switchMode('login');
      } catch (error) {
        handleError(error);
      } finally {
        pending.value = false;
      }
    }

    async function retry() {
      await app.recheck();
      if (auth.isAuthed) await router.replace('/home');
    }

    return {
      mode,
      name,
      email,
      password,
      passwordConfirmation,
      showPassword,
      showPasswordConfirmation,
      code,
      resetEmail,
      pending,
      isOffline,
      fieldMessage,
      switchMode,
      submitLogin,
      submitRegister,
      sendCode,
      submitReset,
      retry,
      qrSvg: qr.qrSvg,
      qrPhase: qr.phase,
      startQr: qr.start,
    };
  },
});
