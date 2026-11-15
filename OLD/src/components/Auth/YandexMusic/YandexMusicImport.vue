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

      <div v-if="importStore.active" class="ym-import__progress">
        <div class="ym-import__progress-heading">
          <span>{{ progressLabel }}</span>
          <span v-if="importStore.total > 0">{{ importStore.progress }}%</span>
        </div>

        <div
            class="ym-import__progress-track"
            role="progressbar"
            :aria-valuenow="importStore.progress"
            aria-valuemin="0"
            aria-valuemax="100"
        >
          <div
              class="ym-import__progress-value"
              :style="{ width: `${importStore.progress}%` }"
          />
        </div>

        <p class="ym-import__progress-detail">
          Обработано {{ importStore.processed }} из
          {{ importStore.total > 0 ? importStore.total : '…' }} треков
        </p>
      </div>

      <div v-if="startError" class="ym-import__error" role="alert">
        {{ startError }}
      </div>

      <div
          v-if="importStore.status === 'failed'"
          class="ym-import__error"
          role="alert"
      >
        {{ importStore.message || 'Импорт завершился с ошибкой.' }}
      </div>

      <div v-if="importStore.pollError" class="ym-import__error" role="alert">
        {{ importStore.pollError }}
      </div>

      <div v-if="importStore.completed" class="ym-import__success" role="status">
        <span class="ym-import__success-icon">✓</span>
        <div>
          <strong>Импорт завершён</strong>
          <p>
            Добавлено: {{ importStore.imported }}.
            Пропущено: {{ importStore.skipped }}.
            Ошибок: {{ importStore.failed }}.
          </p>
        </div>
      </div>

      <div
          v-if="importStore.status === 'cancelled'"
          class="ym-import__notice"
          role="status"
      >
        <span class="ym-import__notice-icon">✕</span>
        <div>
          <strong>Импорт отменён</strong>
          <p>
            Успели: {{ importStore.imported }} из
            {{ importStore.processed }} обработанных.
            Повторный запуск продолжит с учётом уже добавленных.
          </p>
        </div>
      </div>

      <div class="ym-import__actions">
        <button
            v-if="importStore.active"
            type="button"
            class="ym-import__button ym-import__button--cancel"
            @click="onCancelImport"
        >
          Отменить импорт
        </button>

        <button
            v-else-if="!importStore.completed"
            type="button"
            class="ym-import__button"
            :disabled="
            summaryLoading ||
            !!summaryError ||
            total === null ||
            total === 0 ||
            startPending
          "
            @click="onStartImport"
        >
          <span v-if="startPending" class="ym-import__spinner" />
          <span>
            {{
              startPending
                  ? 'Запускаем…'
                  : 'Импортировать избранное'
            }}
          </span>
          <span v-if="!startPending" aria-hidden="true">→</span>
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
import {computed, onBeforeUnmount, watch, ref} from 'vue';

import {getYandexMusicFavoriteSummary} from '@/api/auth';
import {useYandexImportStore} from '@/stores/yandexImport';

interface FavoriteSummary {
  total: number;
  existing?: number;
  new_tracks?: number;
  already_imported?: number;
}

const props = defineProps<{
  connected: boolean;
}>();

defineEmits<{
  'open-library': [];
}>();

const importStore = useYandexImportStore();

const total = ref<number | null>(null);
const existing = ref<number | null>(null);
const newTracks = ref<number | null>(null);

const summaryLoading = ref(false);
const summaryError = ref('');
const startPending = ref(false);
const startError = ref('');

const progressLabel = computed(() => {
  if (importStore.status === 'queued' || importStore.status === 'pending') {
    return 'Импорт в очереди…';
  }

  return 'Импортируем треки…';
});

let summaryRequestId = 0;

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

async function onStartImport(): Promise<void> {
  if (
    !props.connected ||
    startPending.value ||
    summaryLoading.value ||
    total.value === null ||
    total.value === 0
  ) {
    return;
  }

  startPending.value = true;
  startError.value = '';

  try {
    await importStore.start();
  } catch {
    startError.value = importStore.message
        || 'Не удалось запустить импорт. Попробуй ещё раз.';
  } finally {
    startPending.value = false;
  }
}

async function onCancelImport(): Promise<void> {
  await importStore.cancel();
}

watch(
  () => importStore.status,
  (status, previous) => {
    // Импорт доехал до конца (в т.ч. подхваченный после перезахода) —
    // освежаем статистику «уже в SkyFi».
    if (status === 'completed' && previous !== 'completed') {
      void loadSummary();
    }
  },
);

watch(
  () => props.connected,
  (connected) => {
    summaryRequestId++;
    startError.value = '';

    if (connected) {
      void loadSummary();
      // Подхватываем импорт, который мог идти в фоне
      // или начаться до перезапуска приложения.
      void importStore.resume();
    } else {
      total.value = null;
      existing.value = null;
      newTracks.value = null;
      summaryError.value = '';
      summaryLoading.value = false;
      importStore.reset();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  summaryRequestId++;
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
.ym-import__button--cancel { border-color: #4a4458; background: #221f2c; color: #c6c1d2; }
.ym-import__button--cancel:hover { filter: brightness(1.25); }
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
