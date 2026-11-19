import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useOnlineStore } from '@/stores/online';
import { useAuthStore } from '@/stores/auth';

export type AppPhase = 'splash' | 'ready';

export const useAppStore = defineStore('app', () => {
  const phase = ref<AppPhase>('splash');

  let bootPromise: Promise<void> | null = null;

  /**
   * Старт приложения: сначала офлайн-чек (до 5 с), потом
   * сессия. Офлайн — входим по сохранённому профилю без сети
   * (frontend.md §8), без токена гвард сам уведёт на /login.
   */
  async function doBootstrap() {
    const online = useOnlineStore();
    await online.check();
    const auth = useAuthStore();
    await auth.restoreSession({ refresh: online.isOnline === true });
    phase.value = 'ready';
  }

  /** Один бутстрэп на запуск; гвард ждёт тот же promise. */
  function bootstrap(): Promise<void> {
    bootPromise ??= doBootstrap();
    return bootPromise;
  }

  /** Кнопка «Повторить» на офлайн-заглушке: перепроверка без рестарта. */
  async function recheck() {
    const online = useOnlineStore();
    await online.check();
    if (online.isOnline) {
      await useAuthStore().restoreSession({ refresh: true });
    }
  }

  return { phase, bootstrap, recheck };
});
