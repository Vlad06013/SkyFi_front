import { defineStore } from 'pinia';
import { ref } from 'vue';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { checkHealth, HEALTH_TIMEOUT_MS } from '@/api/health';
import { resolveEndpoint } from '@/lib/endpoints';

const POLL_INTERVAL_MS = 10_000;
/** Бутстрэп и кнопка «повторить» — короткий ответ, сплэш не ждёт. */
const FAST_HEALTH_TIMEOUT_MS = 5_000;
/** Не чаще раза в минуту: ipify при флапе не должен уходить на каждый тик. */
const RESOLVE_COOLDOWN_MS = 60_000;
/** Офлайн — только после двух подряд неудачных тиков: на LTE зонд после
 *  простоя регулярно не укладывается даже в 10 с, и каждый такой таймаут
 *  уводил весь плеер в офлайн-режим (поток глушился и не перезапускался). */
const OFFLINE_AFTER_MISSES = 2;

export const useOnlineStore = defineStore('online', () => {
  /** null — первой проверки ещё не было (сплэш). */
  const isOnline = ref<boolean | null>(null);

  let timer: ReturnType<typeof setInterval> | null = null;
  let stateListener: { remove: () => Promise<void> } | null = null;
  let missCount = 0;
  let lastResolveAt = 0;

  async function probe(timeoutMs: number): Promise<boolean> {
    try {
      let ok = await checkHealth(timeoutMs);
      // С домашней сети внешний адрес бэка не открывается. Зонд молчит —
      // переспрашиваем внешний IP и, если сеть домашняя, бьём в локальный адрес.
      if (!ok && (await resolveEndpointCached())) ok = await checkHealth(timeoutMs);
      return ok;
    } catch {
      // checkHealth по контракту не бросает, но поллер не должен падать
      // от любой неожиданной ошибки.
      return false;
    }
  }

  /** resolveEndpoint из зонда: не чаще кулдауна — повторный health оправдан
   *  только когда пара адресов реально могла смениться. */
  async function resolveEndpointCached(): Promise<boolean> {
    const now = Date.now();
    if (now - lastResolveAt < RESOLVE_COOLDOWN_MS) return false;
    lastResolveAt = now;
    return resolveEndpoint();
  }

  /**
   * Проверка сети. fast (бутстрэп, кнопка «повторить») отвечает сразу —
   * сплэш не ждёт второго круга. Фоновые проверки требуют двух промахов
   * подряд перед переводом в офлайн; успех возвращает онлайн сразу.
   */
  async function check(opts: { fast?: boolean } = {}) {
    const ok = await probe(opts.fast ? FAST_HEALTH_TIMEOUT_MS : HEALTH_TIMEOUT_MS);
    if (ok) {
      missCount = 0;
      isOnline.value = true;
      return;
    }
    missCount += 1;
    if (opts.fast || missCount >= OFFLINE_AFTER_MISSES) isOnline.value = false;
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
   * Глобальный поллер на весь жизненный цикл, в том числе в фоне.
   * Иначе свёрнутое приложение застывает в прошлом «онлайн» или,
   * наоборот, не видит, что сеть жива. При возврате на экран
   * проверяем сразу, не дожидаясь следующего тика.
   */
  async function startPolling() {
    await check({ fast: true });
    startInterval();
    if (!Capacitor.isNativePlatform() || stateListener) return;
    stateListener = await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void check();
      if (!timer) startInterval();
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
