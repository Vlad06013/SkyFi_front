import { defineStore } from 'pinia';
import { ref } from 'vue';
import { resolveEndpoint } from '@/lib/endpoints';
import { setNetworkOutcomeHandler, setOfflineGate } from '@/api/http';
import { recordNetEvent } from '@/lib/net-log';

/**
 * Онлайн-детект на сокете (optimizations.md «Онлайн-детект на сокете»):
 * `connected` → онлайн мгновенно; разрыв → офлайн с грейс-периодом
 * против краткого флапа WiFi. HTTP-зонд не используется. Единственный
 * источник флага — события Echo-соединения (realtime/index.ts шлёт
 * сюда noteSocket*). Дополнительно: серия сетевых/5xx фейлов при живом
 * сокете («сокет онлайн, а HTTP бэка умер») → принудительный офлайн и
 * рестарт сокета.
 */

/** Разрыв → офлайн с задержкой: краткий флап WiFi не дёргает плеер. */
const OFFLINE_GRACE_MS = 3_000;
/** Повторный resolveEndpoint (ipify) — не чаще раза в минуту. */
const RESOLVE_COOLDOWN_MS = 60_000;
/** Столько сетевых/5xx фейлов подряд при живом сокете = принудительный офлайн. */
const FAILS_TO_FORCE_OFFLINE = 3;

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

  /** Сокет разорвался (realtime): офлайн после грейса. */
  function noteSocketDisconnected(detail = '') {
    socketConnected = false;
    if (graceTimer) clearTimeout(graceTimer);
    graceTimer = setTimeout(() => {
      graceTimer = null;
      setOnline(false, 'disconnect', detail);
    }, OFFLINE_GRACE_MS);
  }

  /** Сокет не достучался (unavailable/failed): офлайн сразу + переспрос адреса. */
  async function noteSocketFailed(event: 'unavailable' | 'failed', detail = '') {
    socketConnected = false;
    if (graceTimer) {
      clearTimeout(graceTimer);
      graceTimer = null;
    }
    setOnline(false, event, detail);
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
    noteSocketConnected,
    noteSocketDisconnected,
    noteSocketFailed,
    setReconnectHandler,
    onOnline,
  };
});
