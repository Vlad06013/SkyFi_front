import {computed, ref} from 'vue';
import {defineStore} from 'pinia';
import axios from 'axios';

/**
 * Эффективное состояние сети. Офлайн — это либо пропал интерфейс
 * устройства (navigator.onLine), либо сервер не отвечает:
 * для приложения оба случая выглядят одинаково (затемнённые
 * треки, недоступные действия). Реагируют на это перехватчик
 * в @/api/http (сетевые ошибки запросов) и периодический пинг.
 */
export const useNetworkStore = defineStore('network', () => {
    const browserOnline = ref<boolean>(
        typeof navigator === 'undefined' ? true : navigator.onLine,
    );

    /** Сервер отвечает? Сбрасывается при сетевой ошибке любого запроса. */
    const serverReachable = ref(true);

    const isOnline = computed(
        () => browserOnline.value && serverReachable.value,
    );

    let probeTimer: ReturnType<typeof setInterval> | undefined;

    function stopProbe(): void {
        if (probeTimer !== undefined) {
            clearInterval(probeTimer);
            probeTimer = undefined;
        }
    }

    /** Сервер ответил (любым HTTP-статусом) — сеть в порядке. */
    function markServerUp(): void {
        serverReachable.value = true;
        stopProbe();
    }

    /**
     * Запрос ушёл в никуда (соединение отказало, таймаут) —
     * ведём себя как в офлайне и начинаем периодически
     * проверять, не вернулся ли сервер.
     */
    function markServerDown(): void {
        if (!serverReachable.value) return;

        serverReachable.value = false;
        stopProbe();

        const ping = async (): Promise<void> => {
            try {
                await axios.get(
                    import.meta.env.VITE_API_URL as string,
                    {timeout: 5000},
                );

                markServerUp();
            } catch (error) {
                // Любой ответ — даже 404/500 — значит сервер жив.
                if (axios.isAxiosError(error) && error.response) {
                    markServerUp();
                }
            }
        };

        probeTimer = setInterval(() => void ping(), 15_000);
    }

    function handleBrowserOnline(): void {
        browserOnline.value = true;
    }

    function handleBrowserOffline(): void {
        browserOnline.value = false;
    }

    /** Подписка на события браузера/Capacitor WebView. */
    function bind(): void {
        if (typeof window === 'undefined') return;

        window.addEventListener('online', handleBrowserOnline);
        window.addEventListener('offline', handleBrowserOffline);
    }

    return {
        isOnline,
        markServerUp,
        markServerDown,
        bind,
    };
});
