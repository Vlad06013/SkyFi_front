import { defineStore } from 'pinia';
import { ref } from 'vue';
import { activeOrigin, resolveEndpoint } from '@/lib/endpoints';
import { setNetworkOutcomeHandler, setOfflineGate } from '@/api/http';
import { recordNetEvent } from '@/lib/net-log';

/**
 * Онлайн-детект на сокете (optimizations.md «Онлайн-детект на сокете»):
 * `connected` → онлайн мгновенно; разрыв (`disconnected`/`unavailable`/
 * `failed`) → офлайн с грейс-периодом против краткого флапа WiFi и
 * ретраев сокета. Единственный источник флага в установившейся сессии —
 * события Echo-соединения (realtime/index.ts шлёт сюда noteSocket*).
 * Дополнительно: серия сетевых/5xx фейлов при живом сокете («сокет
 * онлайн, а HTTP бэка умер») → принудительный офлайн и рестарт сокета.
 * Единственный HTTP-зонд — стартовый, один на запуск (probeAtStartup):
 * без него мёртвый бэк обнаруживался только таймаутами сокета.
 */

/** Разрыв → офлайн с задержкой: краткий флап WiFi не дёргает плеер. */
const OFFLINE_GRACE_MS = 3_000;
/** Повторный resolveEndpoint (ipify) — не чаще раза в минуту. */
const RESOLVE_COOLDOWN_MS = 60_000;
/** Столько сетевых/5xx фейлов подряд при живом сокете = принудительный офлайн. */
const FAILS_TO_FORCE_OFFLINE = 3;
/** Стартовый зонд ждёт бэк столько, потом — офлайн сразу (баг 14). */
const STARTUP_PROBE_TIMEOUT_MS = 2_500;

export const useOnlineStore = defineStore('online', () => {
  /** null — первого коннекта сокета ещё не было (сплэш не решился). */
  const isOnline = ref<boolean | null>(null);

  let socketConnected = false;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastResolveAt = 0;
  let consecutiveFails = 0;
  let reconnectHandler: (() => void) | null = null;
  const onlineHandlers = new Set<() => void>();

  // Гейт и детектор фейлов ставим при создании стора — раньше любых запросов.
  setOfflineGate(() => isOnline.value === false);
  setNetworkOutcomeHandler((ok) => (ok ? noteHttpOk() : noteHttpFail()));

  function setOnline(value: boolean, event: Parameters<typeof recordNetEvent>[0], detail = '') {
    if (isOnline.value === value) return;
    isOnline.value = value;
    recordNetEvent(event, detail, value ? 'online' : 'offline');
    if (value) onlineHandlers.forEach((handler) => handler());
  }

  /**
   * Стартовый зонд живости бэка (баг 14): без него мёртвый сервер при
   * запуске обнаруживался только таймаутами сокета — секунд 15 «думания»,
   * в которые скачанный трек успевал откатиться. Один fetch no-cors на
   * выбранный endpoint: любой HTTP-ответ = бэк жив (онлайн подтвердит
   * сокет), обрыв/таймаут — офлайн немедленно, сокет догонит и переведёт
   * в онлайн. Это не возврат health-поллера: зонд один на запуск.
   */
  async function probeAtStartup() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setOnline(false, 'probe', 'нет сети (navigator.onLine)');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STARTUP_PROBE_TIMEOUT_MS);
    try {
      await fetch(activeOrigin(), { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    } catch {
      setOnline(false, 'probe', 'бэк не ответил на стартовый зонд');
    } finally {
      clearTimeout(timer);
    }
  }

  /** Сокет соединился (realtime). */
  function noteSocketConnected() {
    socketConnected = true;
    consecutiveFails = 0;
    if (graceTimer) {
      clearTimeout(graceTimer);
      graceTimer = null;
    }
    setOnline(true, 'connect');
  }

  /**
   * Офлайн после грейса: краткий флап WiFi и ретраи сокета не дёргают
   * плеер и баннер. Таймер не перезапускаем: офлайн наступает через
   * грейс от ПЕРВОГО события серии, а не уезжает от каждого ретрая.
   */
  function scheduleOffline(event: 'disconnect' | 'unavailable' | 'failed', detail = '') {
    if (graceTimer || isOnline.value === false) return;
    graceTimer = setTimeout(() => {
      graceTimer = null;
      setOnline(false, event, detail);
    }, OFFLINE_GRACE_MS);
  }

  /** Сокет разорвался (realtime): офлайн после грейса. */
  function noteSocketDisconnected(detail = '') {
    socketConnected = false;
    scheduleOffline('disconnect', detail);
  }

  /**
   * Сессия кончилась (logout, 401): сокет остановлен намеренно.
   * Это не обрыв сети — флаг возвращается в null, иначе грейс от
   * disconnect оставлял «Офлайн-режим» и блокировал «Войти» до перезагрузки.
   */
  function noteSessionEnded() {
    socketConnected = false;
    consecutiveFails = 0;
    if (graceTimer) {
      clearTimeout(graceTimer);
      graceTimer = null;
    }
    if (isOnline.value === null) return;
    isOnline.value = null;
    recordNetEvent('disconnect', 'сессия закрыта');
  }

  /**
   * Сокет не достучался (unavailable/failed): тот же грейс, что и у
   * разрыва (pusher шлёт unavailable между ретраями — мгновенный офлайн
   * рисовал бы баннер на каждый чих), плюс сразу переспрос адреса.
   */
  async function noteSocketFailed(event: 'unavailable' | 'failed', detail = '') {
    socketConnected = false;
    scheduleOffline(event, detail);
    const now = Date.now();
    if (now - lastResolveAt < RESOLVE_COOLDOWN_MS) return;
    lastResolveAt = now;
    // Смена endpointKind перезапустит сокет (watch в realtime/index.ts).
    await resolveEndpoint();
  }

  function noteHttpOk() {
    consecutiveFails = 0;
  }

  function noteHttpFail() {
    if (!socketConnected) return; // офлайн уже по сокету, счётчик не нужен
    consecutiveFails += 1;
    if (consecutiveFails >= FAILS_TO_FORCE_OFFLINE && isOnline.value !== false) {
      setOnline(false, 'force-offline', `фейлов подряд: ${consecutiveFails}`);
      // Рвём сокет принудительно: реконнект либо лечит (гейт снова
      // пропустит запросы), либо подтвердит офлайн. Иначе при живом
      // сокете и умершем HTTP гейт молчал бы вечно.
      reconnectHandler?.();
    }
  }

  /** main.ts: рестарт realtime по force-offline (stop/start Echo). */
  function setReconnectHandler(handler: () => void): void {
    reconnectHandler = handler;
  }

  /** Подписка на переход в онлайн (флаш буфера избранного и т.п.). */
  function onOnline(handler: () => void): () => void {
    onlineHandlers.add(handler);
    return () => {
      onlineHandlers.delete(handler);
    };
  }

  return {
    isOnline,
    probeAtStartup,
    noteSocketConnected,
    noteSocketDisconnected,
    noteSessionEnded,
    noteSocketFailed,
    setReconnectHandler,
    onOnline,
  };
});
