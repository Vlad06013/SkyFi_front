import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  disconnectYandex,
  fetchYandexDeviceStatus,
  startYandexDeviceAuth,
} from '@/api/yandex';
import type { YandexDeviceStatusPayload } from '@/types';

/** Троттлинг статуса 30/мин — 3 с даёт ~20/мин с запасом. */
const POLL_INTERVAL_MS = 3_000;

const LIVE_STATUSES = ['not_started', 'pending', 'connected'];

export const useYandexStore = defineStore('yandex', () => {
  /** null — первого refresh ещё не было. */
  const connected = ref<boolean | null>(null);
  /** Активная device-сессия: ждём, пока код введут на странице Яндекса. */
  const awaiting = ref(false);
  /** Сессия умерла (expired/failed/...) — показать «перезапросить код». */
  const expired = ref(false);
  const userCode = ref<string | null>(null);
  const verificationUrl = ref<string | null>(null);
  /** start/disconnect в полёте. */
  const busy = ref(false);

  let timer: ReturnType<typeof setInterval> | null = null;

  function stopPolling() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function startPolling() {
    stopPolling();
    timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
  }

  function applyStatus(payload: YandexDeviceStatusPayload) {
    connected.value = payload.connected;
    if (payload.status === 'pending') {
      awaiting.value = true;
      expired.value = false;
      userCode.value = payload.user_code ?? null;
      verificationUrl.value = payload.verification_url ?? null;
      startPolling();
      return;
    }
    awaiting.value = false;
    stopPolling();
    if (LIVE_STATUSES.includes(payload.status)) {
      // not_started/connected — чистое состояние, кода нет.
      expired.value = false;
      userCode.value = null;
      verificationUrl.value = null;
      return;
    }
    // Любое другое (expired/failed/consumed/...) — сессию бэк уже удалил.
    expired.value = true;
  }

  /** Тихий поллинг: офлайн/429 глушим — следующий тик или онлайн-стор всё решат. */
  async function poll() {
    try {
      applyStatus(await fetchYandexDeviceStatus());
    } catch {
      // Намеренно пусто.
    }
  }

  /** Загрузить текущее состояние. Ошибку пробрасываем — карточка решает сама. */
  async function refresh() {
    applyStatus(await fetchYandexDeviceStatus());
  }

  async function connect() {
    if (busy.value) return;
    busy.value = true;
    expired.value = false;
    try {
      // Идемпотентен: активную сессию вернёт как есть (тот же код).
      const payload = await startYandexDeviceAuth();
      connected.value = false;
      awaiting.value = true;
      userCode.value = payload.user_code;
      verificationUrl.value = payload.verification_url;
      startPolling();
    } finally {
      busy.value = false;
    }
  }

  async function disconnect() {
    if (busy.value) return;
    busy.value = true;
    try {
      await disconnectYandex();
    } finally {
      busy.value = false;
    }
    stopPolling();
    connected.value = false;
    awaiting.value = false;
    expired.value = false;
    userCode.value = null;
    verificationUrl.value = null;
  }

  return {
    connected,
    awaiting,
    expired,
    userCode,
    verificationUrl,
    busy,
    refresh,
    connect,
    disconnect,
    stopPolling,
  };
});
