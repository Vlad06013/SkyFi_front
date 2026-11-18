import { defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'qr';

export default defineComponent({
  name: 'LoginPage',
  setup() {
    const router = useRouter();
    const auth = useAuthStore();
    const mode = ref<Mode>('login');
    const email = ref('vlad@mail.ru');
    const password = ref('');
    const name = ref('');
    const code = ref('481');

    function submitLogin() {
      auth.login(name.value || 'Влад', email.value);
      router.replace('/home');
    }

    function submitRegister() {
      auth.login(name.value || 'Влад', email.value);
      router.replace('/home');
    }

    function sendCode() {
      mode.value = 'reset';
    }

    function resetPassword() {
      mode.value = 'login';
    }

    return {
      mode,
      email,
      password,
      name,
      code,
      submitLogin,
      submitRegister,
      sendCode,
      resetPassword,
    };
  },
});
