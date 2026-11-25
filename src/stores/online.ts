import { defineStore } from 'pinia';
import { ref } from 'vue';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { checkHealth } from '@/api/health';
import { resolveEndpoint } from '@/lib/endpoints';

const POLL_INTERVAL_MS = 10_000;

export const useOnlineStore = defineStore('online', () => {
  /** null — первой проверки ещё не было (сплэш). */
  const isOnline = ref<boolean | null>(null);

  let timer: ReturnType<typeof setInterval> | null = null;
  let stateListener: { remove: () => Promise<void> } | null = null;

  async function check() {
    try {
      let ok = await checkHealth();
      // С домашней сети внешний адрес бэка не открывается. Зонд молчит —
      // переспрашиваем внешний IP и, если сеть домашняя, бьём в локальный адрес.
      if (!ok && (await resolveEndpoint())) ok = await checkHealth();
      isOnline.value = ok;
    } catch {
      // checkHealth по контракту не бросает, но поллер не должен падать
      // от любой неожиданной ошибки.
      isOnline.value = false;
    }
  }

  function startInterval() {
    stopInterval();
    timer = setInterval(() => void check(), POLL_INTERVAL_MS);
  }

  function stopInterval() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  /**
   * Глобальный поллер на весь жизненный цикл приложения.
   * На нативе в фоне таймер глушим (JS throttling всё равно
   * ломал бы ритм) и проверяем сразу при возврате.
   */
  async function startPolling() {
    await check();
    startInterval();
    if (!Capacitor.isNativePlatform() || stateListener) return;
    stateListener = await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        void check();
        startInterval();
      } else {
        stopInterval();
      }
    });
  }

  async function stopPolling() {
    stopInterval();
    if (stateListener) {
      await stateListener.remove();
      stateListener = null;
    }
  }

  return { isOnline, check, startPolling, stopPolling };
});
