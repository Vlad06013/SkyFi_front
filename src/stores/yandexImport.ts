import {computed, ref} from 'vue';
import {defineStore} from 'pinia';

import {
    cancelYandexMusicImport,
    getYandexMusicCurrentImport,
    getYandexMusicFavoriteImportStatus,
    startYandexMusicFavoriteImport,
} from '@/api/auth';
import type {YandexMusicImportStatus} from '@/types/TypeApiRespone';

/**
 * Импорт избранного из Яндекс Музыки.
 *
 * Сессия живёт в сторе, а не в компоненте: прогресс переживает
 * уход со страницы профиля. При входе на экран resume()
 * спрашивает текущую запись импорта на бэке — так ход импорта
 * подхватывается даже после перезапуска приложения.
 */

const POLL_INTERVAL_MS = 1500;
const POLL_RETRY_MS = 3000;

const ACTIVE_STATUSES = ['queued', 'pending', 'running', 'processing'];
const COMPLETED_STATUSES = ['completed', 'finished', 'success'];
const FAILED_STATUSES = ['failed', 'error'];

export const useYandexImportStore = defineStore('yandexImport', () => {
    /** Статус записи на сервере; null — записи нет. */
    const status = ref<string | null>(null);
    const jobId = ref<string | null>(null);
    const total = ref(0);
    const processed = ref(0);
    const imported = ref(0);
    const skipped = ref(0);
    const failed = ref(0);
    const message = ref('');

    /** Сбой последнего запроса статуса (сеть/сервер), не импорта. */
    const pollError = ref('');

    const active = computed(
        () => status.value !== null && ACTIVE_STATUSES.includes(status.value),
    );

    const completed = computed(
        () => status.value !== null && COMPLETED_STATUSES.includes(status.value),
    );

    const progress = computed(() => {
        if (completed.value) return 100;
        if (total.value <= 0) return 0;

        return Math.min(100, Math.round((processed.value / total.value) * 100));
    });

    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let pollInFlight = false;
    let generation = 0;

    function clearPolling(): void {
        generation++;
        pollTimer = undefined;
    }

    function applyStatus(next: YandexMusicImportStatus): void {
        if (typeof next.job_id === 'string') jobId.value = next.job_id;
        if (typeof next.total === 'number') total.value = next.total;
        if (typeof next.processed === 'number') processed.value = next.processed;
        if (typeof next.imported === 'number') imported.value = next.imported;
        if (typeof next.skipped === 'number') skipped.value = next.skipped;
        if (typeof next.failed === 'number') failed.value = next.failed;
        if (typeof next.message === 'string') message.value = next.message;

        status.value = next.status;
    }

    function reset(): void {
        clearPolling();
        status.value = null;
        jobId.value = null;
        total.value = 0;
        processed.value = 0;
        imported.value = 0;
        skipped.value = 0;
        failed.value = 0;
        message.value = '';
        pollError.value = '';
        pollInFlight = false;
    }

    async function poll(): Promise<void> {
        if (!active.value || !jobId.value || pollInFlight) return;

        const myGeneration = generation;

        pollInFlight = true;

        try {
            const response = await getYandexMusicFavoriteImportStatus(jobId.value);

            if (myGeneration !== generation) return;

            pollError.value = '';

            const next = response.data as YandexMusicImportStatus;

            applyStatus(next);

            if (COMPLETED_STATUSES.includes(next.status)) {
                clearPolling();
                return;
            }

            if (FAILED_STATUSES.includes(next.status)) {
                clearPolling();
                return;
            }

            if (next.status === 'cancelled') {
                clearPolling();
                return;
            }

            pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        } catch (error) {
            if (myGeneration !== generation) return;

            pollError.value = 'Не удалось получить состояние импорта. Повторяем…';

            console.error('[YandexImport] Status request failed:', error);

            pollTimer = setTimeout(() => void poll(), POLL_RETRY_MS);
        } finally {
            pollInFlight = false;
        }
    }

    /** Запустить поллинг, если импорт ещё идёт. */
    function ensurePolling(): void {
        if (active.value && pollTimer === undefined && !pollInFlight) {
            pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
        }
    }

    /** Запуск импорта с нуля. */
    async function start(): Promise<void> {
        reset();
        status.value = 'queued';
        message.value = 'Запускаем импорт…';

        try {
            const response = await startYandexMusicFavoriteImport();
            const next = response.data as YandexMusicImportStatus;

            applyStatus(next);
            ensurePolling();
        } catch (error) {
            reset();
            message.value = 'Не удалось запустить импорт. Попробуй ещё раз.';

            console.error('[YandexImport] Import start failed:', error);

            throw error;
        }
    }

    /** Отмена активного импорта. */
    async function cancel(): Promise<void> {
        if (!active.value) return;

        clearPolling();

        try {
            const response = await cancelYandexMusicImport();
            const next = response.data as YandexMusicImportStatus | null;

            if (next) applyStatus(next);
        } catch (error) {
            console.error('[YandexImport] Cancel failed:', error);
            pollError.value = 'Не удалось отменить импорт.';
            ensurePolling();
        }
    }

    /**
     * Подхват состояния при входе на экран: спрашиваем запись
     * импорта на сервере; если она в работе — продолжаем поллинг
     * с места, если завершилась/отменилась — показываем итог.
     */
    async function resume(): Promise<void> {
        // Своя активная сессия уже поллится — не мешаем.
        if (active.value) {
            ensurePolling();
            return;
        }

        try {
            const response = await getYandexMusicCurrentImport();
            const next = response.data as YandexMusicImportStatus | null;

            if (!next) {
                reset();
                return;
            }

            applyStatus(next);
            ensurePolling();
        } catch (error) {
            console.error('[YandexImport] Current import request failed:', error);
        }
    }

    return {
        status,
        jobId,
        total,
        processed,
        imported,
        skipped,
        failed,
        message,
        pollError,
        active,
        completed,
        progress,
        start,
        cancel,
        resume,
        reset,
    };
});
