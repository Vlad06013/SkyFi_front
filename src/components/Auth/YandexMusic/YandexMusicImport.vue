<template>
  <section class="ym-import">
    <div class="ym-import__heading">
      <div class="ym-import__icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
              d="M5 17V7l14-3v13"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
          />
          <circle cx="5" cy="18" r="3" fill="currentColor" />
          <circle cx="19" cy="17" r="3" fill="currentColor" />
        </svg>
      </div>

      <div class="ym-import__title">
        <span class="ym-import__eyebrow">СИНХРОНИЗАЦИЯ</span>
        <h3>Импорт избранного</h3>
        <p>Перенеси любимые треки в свою библиотеку SkyFi.</p>
      </div>
    </div>

    <div v-if="!connected" class="ym-import__notice">
      <span class="ym-import__notice-icon">↗</span>
      <div>
        <strong>Сначала подключи Яндекс Музыку</strong>
        <p>После авторизации здесь появится импорт любимых треков.</p>
      </div>
    </div>

    <template v-else>
      <div class="ym-import__stats">
        <div class="ym-import__stat">
          <span>В избранном</span>
          <strong>
            {{ summaryLoading ? '…' : total ?? '—' }}
          </strong>
        </div>

        <div class="ym-import__stat">
          <span>Уже в SkyFi</span>
          <strong>
            {{ summaryLoading ? '…' : existing ?? '—' }}
          </strong>
        </div>

        <div class="ym-import__stat">
          <span>Новых треков</span>
          <strong class="ym-import__accent">
            {{ summaryLoading ? '…' : newTracks ?? '—' }}
          </strong>
        </div>
      </div>

      <div v-if="summaryError" class="ym-import__error" role="alert">
        {{ summaryError }}

        <button
            type="button"
            class="ym-import__retry"
            @click="loadSummary"
        >
          Повторить запрос
        </button>
      </div>

      <template v-if="importLoading">
        <div class="ym-import__progress">
          <div class="ym-import__progress-heading">
            <span>{{ progressLabel }}</span>
            <span v-if="progress !== null">{{ progress }}%</span>
          </div>

          <div
              class="ym-import__progress-track"
              role="progressbar"
              :aria-valuenow="progress ?? undefined"
              aria-valuemin="0"
              aria-valuemax="100"
          >
            <div
                class="ym-import__progress-value"
                :style="{ width: `${progress ?? 0}%` }"
            />
          </div>

          <p class="ym-import__progress-detail">
            Обработано {{ processed }} из {{ importTotal }} треков
          </p>
        </div>
      </template>

      <div v-if="importError" class="ym-import__error" role="alert">
        {{ importError }}
      </div>

      <div v-if="completed" class="ym-import__success" role="status">
        <span class="ym-import__success-icon">✓</span>
        <div>
          <strong>Импорт завершён</strong>
          <p>
            Добавлено: {{ importedCount }}.
            Пропущено: {{ skippedCount }}.
            Ошибок: {{ failedCount }}.
          </p>
        </div>
      </div>

      <div class="ym-import__actions">
        <button
            v-if="!completed"
            type="button"
            class="ym-import__button"
            :disabled="
            summaryLoading ||
            !!summaryError ||
            total === null ||
            total === 0 ||
            importLoading
          "
            @click="startImport"
        >
          <span v-if="importLoading" class="ym-import__spinner" />
          <span>
            {{
              importLoading
                  ? 'Импортируем…'
                  : 'Импортировать избранное'
            }}
          </span>
          <span v-if="!importLoading" aria-hidden="true">→</span>
        </button>

        <button
            v-else
            type="button"
            class="ym-import__button"
            @click="$emit('open-library')"
        >
          Открыть библиотеку
          <span aria-hidden="true">→</span>
        </button>

        <p class="ym-import__hint">
          Импортируются данные треков. Аудиофайлы не скачиваются.
        </p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch, ref } from 'vue';

import {
  getYandexMusicFavoriteSummary,
  startYandexMusicFavoriteImport,
  getYandexMusicFavoriteImportStatus,
} from '@/api/auth';

interface FavoriteSummary {
  total: number;
  existing?: number;
  new_tracks?: number;
  already_imported?: number;
}

interface ImportStart {
  job_id?: string;
  jobId?: string;
  status?: string;
  total?: number;
  processed?: number;
  imported?: number;
  skipped?: number;
  failed?: number;
  progress?: number;
  message?: string;
}

interface ImportStatus {
  status: string;
  total?: number;
  processed?: number;
  imported?: number;
  skipped?: number;
  failed?: number;
  progress?: number;
  message?: string;
}

const props = defineProps<{
  connected: boolean;
}>();

defineEmits<{
  'open-library': [];
}>();

const total = ref<number | null>(null);
const existing = ref<number | null>(null);
const newTracks = ref<number | null>(null);

const summaryLoading = ref(false);
const summaryError = ref('');
const importLoading = ref(false);
const importError = ref('');

const jobId = ref<string | null>(null);
const importTotal = ref(0);
const processed = ref(0);
const importedCount = ref(0);
const skippedCount = ref(0);
const failedCount = ref(0);
const progress = ref<number | null>(null);
const progressLabel = ref('Подготовка импорта…');
const completed = ref(false);

let summaryRequestId = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let pollRequestInProgress = false;

function clearPolling(): void {
  if (pollTimer !== undefined) {
    clearTimeout(pollTimer);
    pollTimer = undefined;
  }
}

function resetImport(): void {
  clearPolling();
  jobId.value = null;
  importLoading.value = false;
  importError.value = '';
  completed.value = false;
  importTotal.value = 0;
  processed.value = 0;
  importedCount.value = 0;
  skippedCount.value = 0;
  failedCount.value = 0;
  progress.value = null;
  progressLabel.value = 'Подготовка импорта…';
  pollRequestInProgress = false;
}

function hasApiErrors(errors: unknown): boolean {
  if (errors === null || errors === undefined) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === 'object') return Object.keys(errors).length > 0;
  return Boolean(errors);
}

async function loadSummary(): Promise<void> {
  if (!props.connected) return;

  const requestId = ++summaryRequestId;
  summaryLoading.value = true;
  summaryError.value = '';

  try {
    const response = await getYandexMusicFavoriteSummary();

    if (requestId !== summaryRequestId) return;

    if (hasApiErrors(response.errors)) {
      throw new Error('API вернул ошибку при загрузке статистики.');
    }

    const summary = response.data as FavoriteSummary;

    if (!summary || !Number.isFinite(Number(summary.total))) {
      throw new Error('Ответ статистики не содержит корректное поле total.');
    }

    total.value = Number(summary.total);
    existing.value =
      summary.existing ?? summary.already_imported ?? null;

    newTracks.value =
      summary.new_tracks ??
      (
        existing.value !== null
          ? Math.max(0, total.value - existing.value)
          : null
      );
  } catch (error) {
    if (requestId !== summaryRequestId) return;

    total.value = null;
    existing.value = null;
    newTracks.value = null;
    summaryError.value = 'Не удалось загрузить статистику избранного.';

    console.error('[YandexMusicImport] Summary request failed:', error);
  } finally {
    if (requestId === summaryRequestId) {
      summaryLoading.value = false;
    }
  }
}

async function startImport(): Promise<void> {
  if (
    !props.connected ||
    importLoading.value ||
    summaryLoading.value ||
    total.value === null ||
    total.value === 0
  ) {
    return;
  }

  resetImport();
  importLoading.value = true;
  progressLabel.value = 'Запускаем импорт…';
  importError.value = '';

  try {
    const response = await startYandexMusicFavoriteImport();

    if (hasApiErrors(response.errors)) {
      throw new Error('API вернул ошибку при запуске импорта.');
    }

    const result = response.data as ImportStart;
    const id = result.job_id ?? result.jobId;

    if (!id) {
      if (
        result.status === 'completed' ||
        result.status === 'finished' ||
        result.status === 'success'
      ) {
        applyStatus(result as ImportStatus);
        finishImport();
        await loadSummary();
        return;
      }

      throw new Error('Сервер не вернул идентификатор задачи импорта.');
    }

    jobId.value = id;

    if (typeof result.total === 'number') importTotal.value = result.total;
    applyStatus(result as ImportStatus);

    await pollImportStatus();
  } catch (error) {
    importLoading.value = false;
    importError.value = 'Не удалось запустить импорт. Попробуй ещё раз.';

    console.error('[YandexMusicImport] Import start failed:', error);
  }
}

function applyStatus(status: ImportStatus): void {
  if (typeof status.total === 'number') {
    importTotal.value = status.total;
  }

  if (typeof status.processed === 'number') {
    processed.value = status.processed;
  }

  if (typeof status.imported === 'number') {
    importedCount.value = status.imported;
  }

  if (typeof status.skipped === 'number') {
    skippedCount.value = status.skipped;
  }

  if (typeof status.failed === 'number') {
    failedCount.value = status.failed;
  }

  if (typeof status.progress === 'number') {
    progress.value = Math.min(100, Math.max(0, status.progress));
  } else if (importTotal.value > 0) {
    progress.value = Math.min(
      100,
      Math.round((processed.value / importTotal.value) * 100),
    );
  }

  if (status.message) {
    progressLabel.value = status.message;
  } else if (status.status === 'queued' || status.status === 'pending') {
    progressLabel.value = 'Импорт в очереди…';
  } else if (status.status === 'running' || status.status === 'processing') {
    progressLabel.value = 'Импортируем треки…';
  }
}

async function pollImportStatus(): Promise<void> {
  if (
    !jobId.value ||
    !importLoading.value ||
    pollRequestInProgress
  ) {
    return;
  }

  pollRequestInProgress = true;

  try {
    const response = await getYandexMusicFavoriteImportStatus(jobId.value);

    if (!importLoading.value || !jobId.value) return;

    if (hasApiErrors(response.errors)) {
      throw new Error('API вернул ошибку при получении статуса импорта.');
    }

    const status = response.data as ImportStatus;
    applyStatus(status);

    if (['completed', 'finished', 'success'].includes(status.status)) {
      finishImport();
      await loadSummary();
      return;
    }

    if (['failed', 'error'].includes(status.status)) {
      importLoading.value = false;
      importError.value = status.message || 'Импорт завершился с ошибкой.';
      clearPolling();
      return;
    }

    pollTimer = setTimeout(() => {
      void pollImportStatus();
    }, 1500);
  } catch (error) {
    if (!importLoading.value) return;

    importError.value =
      'Не удалось получить состояние импорта. Повторяем запрос…';

    console.error('[YandexMusicImport] Status request failed:', error);

    pollTimer = setTimeout(() => {
      void pollImportStatus();
    }, 3000);
  } finally {
    pollRequestInProgress = false;
  }
}

function finishImport(): void {
  progress.value = 100;
  progressLabel.value = 'Импорт завершён';
  completed.value = true;
  importLoading.value = false;
  clearPolling();
}

watch(
  () => props.connected,
  (connected) => {
    summaryRequestId++;
    resetImport();

    if (connected) {
      void loadSummary();
    } else {
      total.value = null;
      existing.value = null;
      newTracks.value = null;
      summaryError.value = '';
      summaryLoading.value = false;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  summaryRequestId++;
  clearPolling();
});
</script>

<style scoped>
.ym-import {
  min-width: 0;
  padding-top: 22px;
  border-top: 1px solid #302d3c;
  color: #f4f4fa;
}
.ym-import__heading { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; }
.ym-import__icon { display: grid; place-items: center; flex: 0 0 46px; width: 46px; height: 46px; border: 1px solid #a78bfa35; border-radius: 14px; background: #a78bfa12; color: #b9a3ff; }
.ym-import__icon svg { width: 23px; height: 23px; }
.ym-import__title { min-width: 0; }
.ym-import__eyebrow { color: #a995f5; font-size: 10px; font-weight: 700; letter-spacing: 1.5px; }
.ym-import__title h3 { margin: 6px 0; color: #fff; font-size: 18px; font-weight: 650; }
.ym-import__title p, .ym-import__notice p, .ym-import__success p { margin: 0; color: #aaa6b7; font-size: 12px; line-height: 1.65; }
.ym-import__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 20px; }
.ym-import__stat { min-width: 0; padding: 15px 12px; border: 1px solid #302d3c; border-radius: 13px; background: #ffffff03; }
.ym-import__stat span { display: block; margin-bottom: 9px; color: #aaa6b7; font-size: 11px; line-height: 1.4; }
.ym-import__stat strong { color: #fff; font-size: 24px; font-weight: 650; font-variant-numeric: tabular-nums; }
.ym-import__stat .ym-import__accent { color: #b9a3ff; }
.ym-import__actions { margin-top: 18px; }
.ym-import__button { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 46px; padding: 12px 16px; border: 1px solid #a78bfa; border-radius: 12px; background: linear-gradient(135deg, #9878f5, #7554d8); color: #fff; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; transition: filter .2s, opacity .2s; }
.ym-import__button:hover:not(:disabled) { filter: brightness(1.1); }
.ym-import__button:disabled { cursor: not-allowed; opacity: .7; }
.ym-import__hint { margin: 11px 0 0; color: #858195; font-size: 11px; line-height: 1.6; text-align: center; }
.ym-import__notice, .ym-import__success { display: flex; align-items: flex-start; gap: 12px; padding: 15px; border: 1px solid #302d3c; border-radius: 13px; background: #ffffff03; }
.ym-import__notice-icon, .ym-import__success-icon { display: grid; place-items: center; flex: 0 0 28px; width: 28px; height: 28px; border-radius: 9px; background: #a78bfa15; color: #b9a3ff; font-size: 16px; }
.ym-import__notice strong, .ym-import__success strong { display: block; margin: 3px 0 5px; color: #f4f4fa; font-size: 12px; }
.ym-import__success { border-color: #4ade8030; background: #4ade8008; }
.ym-import__success-icon { background: #4ade8015; color: #86efac; }
.ym-import__progress { margin: 20px 0; }
.ym-import__progress-heading { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 10px; color: #c6c1d2; font-size: 11px; }
.ym-import__progress-track { height: 7px; overflow: hidden; border-radius: 10px; background: #302d3c; }
.ym-import__progress-value { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #8b6cf0, #c4b5fd); transition: width .25s ease; }
.ym-import__progress-detail { margin: 8px 0 0; color: #858195; font-size: 11px; }
.ym-import__error { margin-top: 14px; padding: 12px 14px; border: 1px solid #f8717135; border-radius: 10px; background: #f871710c; color: #fca5a5; font-size: 12px; line-height: 1.6; }
.ym-import__retry { display: block; margin-top: 8px; padding: 0; border: 0; background: transparent; color: #c4b5fd; font: inherit; cursor: pointer; text-decoration: underline; }
.ym-import__spinner { width: 14px; height: 14px; border: 2px solid #ffffff60; border-top-color: #fff; border-radius: 50%; animation: ym-spin .7s linear infinite; }
@keyframes ym-spin { to { transform: rotate(360deg); } }
@media (max-width: 480px) {
  .ym-import__stats { gap: 7px; }
  .ym-import__stat { padding: 12px 9px; }
  .ym-import__stat span { min-height: 30px; font-size: 10px; }
  .ym-import__stat strong { font-size: 21px; }
}
</style>
