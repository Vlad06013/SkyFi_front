import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  cancelYandexImport,
  disconnectYandex,
  fetchYandexDeviceStatus,
  fetchYandexImportProgress,
  fetchYandexImportSummary,
  startYandexDeviceAuth,
  startYandexImport,
} from '@/api/yandex';
import { useFavoritesStore } from '@/stores/favorites';
import type { YandexDeviceStatusPayload, YandexImportProgressPayload, YandexImportSummaryPayload } from '@/types';

/** Троттлинг статуса 30/мин — 3 с даёт ~20/мин с запасом. */
const POLL_INTERVAL_MS = 3_000;

const LIVE_STATUSES = ['not_started', 'pending', 'connected'];
const ACTIVE_JOB_STATUSES = ['queued', 'running'];

function isActiveJob(payload: YandexImportProgressPayload | null): boolean {
  return payload !== null && ACTIVE_JOB_STATUSES.includes(payload.status);
}

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

  /** Сводка лайкнутого (total) и перенесённого (existing). null — не грузили/нет подключения. */
  const summary = ref<YandexImportSummaryPayload | null>(null);
  /** Активная (или последняя) задача импорта; null — импорт ни разу не запускался. */
  const progress = ref<YandexImportProgressPayload | null>(null);

  const importActive = computed(() => isActiveJob(progress.value));

  let timer: ReturnType<typeof setInterval> | null = null;
  let importTimer: ReturnType<typeof setInterval> | null = null;

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

  function stopImportPolling() {
    if (importTimer) {
      clearInterval(importTimer);
      importTimer = null;
    }
  }

  function startImportPolling() {
    stopImportPolling();
    importTimer = setInterval(() => void pollImport(), POLL_INTERVAL_MS);
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
      if (payload.connected) {
        void syncImportState();
      } else {
        clearImportState();
      }
      return;
    }
    // Любое другое (expired/failed/consumed/...) — сессию бэк уже удалил.
    expired.value = true;
  }

  /** Тихий поллинг авторизации: офлайн/429 глушим — следующий тик или онлайн-стор всё решат. */
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

  /** Свежая сводка + прогресс. Тихая: бьёт по Яндексу, на экране не критично. */
  async function syncImportState() {
    try {
      summary.value = await fetchYandexImportSummary();
    } catch {
      summary.value = null;
    }
    await loadProgress();
  }

  async function loadProgress() {
    try {
      applyProgress(await fetchYandexImportProgress());
    } catch {
      // Офлайн/троттлинг — оставляем прошлое значение.
    }
  }

  function applyProgress(payload: YandexImportProgressPayload | null) {
    progress.value = payload;
    if (isActiveJob(payload)) {
      startImportPolling();
    } else {
      stopImportPolling();
    }
  }

  function clearImportState() {
    summary.value = null;
    progress.value = null;
    stopImportPolling();
  }

  /** Поллинг джобы: активные статусы глушим тихо, финал обновляет сводку и «Моё». */
  async function pollImport() {
    try {
      const wasActive = isActiveJob(progress.value);
      const payload = await fetchYandexImportProgress();
      applyProgress(payload);
      if (payload?.status === 'completed' && wasActive) {
        try {
          summary.value = await fetchYandexImportSummary();
        } catch {
          summary.value = null;
        }
        void useFavoritesStore().fetchAll().catch(() => undefined);
      }
    } catch {
      // Намеренно пусто.
    }
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
    clearImportState();
  }

  async function startImport() {
    if (busy.value || importActive.value) return;
    busy.value = true;
    try {
      applyProgress(await startYandexImport());
    } finally {
      busy.value = false;
    }
  }

  async function cancelImport() {
    if (busy.value) return;
    busy.value = true;
    try {
      applyProgress(await cancelYandexImport());
    } finally {
      busy.value = false;
    }
  }

  return {
    connected,
    awaiting,
    expired,
    userCode,
    verificationUrl,
    busy,
    summary,
    progress,
    importActive,
    refresh,
    connect,
    disconnect,
    stopPolling,
    stopImportPolling,
    startImport,
    cancelImport,
  };
});
