import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';

export type AppPhase = 'splash' | 'ready';

export const useAppStore = defineStore('app', () => {
  const phase = ref<AppPhase>('splash');

  let bootPromise: Promise<void> | null = null;

  /**
   * Старт приложения: сессия гидрируется сразу из хранилища,
   * онлайн-стейт решает сокет (realtime стартует в main.ts после
   * bootstrap), свежесть токена проверяем по первому коннекту.
   * Без токена гвард сам уведёт на /login.
   */
  async function doBootstrap() {
    const auth = useAuthStore();
    await auth.restoreSession({ refresh: false });
    phase.value = 'ready';
  }

  /** Один бутстрэп на запуск; гвард ждёт тот же promise. */
  function bootstrap(): Promise<void> {
    bootPromise ??= doBootstrap();
    return bootPromise;
  }

  /** Кнопка «Повторить» на офлайн-заглушке: повтор входа, когда сеть появилась. */
  async function recheck() {
    await useAuthStore().restoreSession({ refresh: true });
  }

  return { phase, bootstrap, recheck };
});
