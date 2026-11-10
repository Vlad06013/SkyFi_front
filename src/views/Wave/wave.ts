import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import usePlayerStore from '@/stores/player';
import { getWaveTracks } from '@/api/wave';
import { getYandexMusicDeviceAuthStatus } from '@/api/auth';
import { yandexMusicConnected } from '@/lib/yandexConnection';
import { type Track } from '@/types/TrackType';

// ============================================
// WAVE — «МОЯ ВОЛНА» ЯНДЕКС МУЗЫКИ
// ============================================

export function useWave() {
    const player = usePlayerStore();

    const waveTracks = ref<Track[]>([]);

    const waveLoading = ref(false);

    const waveError = ref('');

    /** Звучит любой трек (эквалайзер и кнопка в режиме паузы). */
    const isPlaying = computed(() => player.isPlaying);

    /**
     * Трек для центрального блока: что реально звучит в плеере —
     * волна или другой источник (избранное, плейлист, поиск).
     * В тишине — первый трек свежей выдачи как превью волны.
     */
    const heroDisplay = computed(() => {
        const current = player.currentTrack;

        if (current) {
            return {
                title: current.title,
                artist: current.artist,
                cover: current.coverPath,
            };
        }

        const first = waveTracks.value[0];

        if (!first) return null;

        return {
            title: first.title,
            artist:
                first.meta.artists
                    .map(artist => artist.name)
                    .join(', ')
                || 'Неизвестный исполнитель',
            cover: first.meta.album?.cover_path ?? null,
        };
    });

    async function loadWave(): Promise<void> {
        if (waveLoading.value) return;

        waveLoading.value = true;
        waveError.value = '';

        try {
            waveTracks.value = await getWaveTracks(20);

            if (waveTracks.value.length === 0) {
                waveError.value = 'Волна пока пуста.';
            }
        } catch {
            waveError.value =
                'Не удалось загрузить волну. Подключи аккаунт Яндекс Музыки.';

            // Пока висит ошибка — периодически проверяем статус
            // авторизации: как только Яндекс подключится (в этой
            // вкладке или любой другой), волна подтянется сама.
            startAuthStatusPoll();
        } finally {
            waveLoading.value = false;
        }
    }

    let authStatusPollTimer: ReturnType<typeof setInterval> | null = null;

    function stopAuthStatusPoll(): void {
        if (authStatusPollTimer !== null) {
            clearInterval(authStatusPollTimer);
            authStatusPollTimer = null;
        }
    }

    function startAuthStatusPoll(): void {
        stopAuthStatusPoll();

        authStatusPollTimer = setInterval(() => {
            void checkYandexAuthAndRetry();
        }, 5000);
    }

    async function checkYandexAuthAndRetry(): Promise<void> {
        try {
            const result = await getYandexMusicDeviceAuthStatus();

            if (result.connected || result.status === 'connected') {
                yandexMusicConnected.value = true;
                stopAuthStatusPoll();
                await loadWave();
            }
        } catch {
            // Статус временно недоступен — попробуем на следующем тике.
        }
    }

    // Авторизация Яндекса завершилась (событие компонента авторизации)
    // — подтягиваем выдачу, не дожидаясь перезахода на страницу.
    watch(yandexMusicConnected, (connected) => {
        if (!connected) return;

        stopAuthStatusPoll();

        if (waveTracks.value.length === 0) {
            void loadWave();
        }
    });

    /**
     * Большая кнопка работает как плеерная: звучит (или стоит
     * на паузе) любой источник — пауза/продолжение текущего
     * трека. Волна запускается только в тишине. Переход в волну
     * при живом чужом источнике — кнопкой «В волну».
     */
    async function playWave(): Promise<void> {
        if (player.isLoading) return;

        if (player.currentTrack) {
            await player.togglePlay();

            return;
        }

        await switchToWave();
    }

    /**
     * «В волну»: гасим чужой источник и запускаем волну —
     * очередь плеера подменяется свежей выдачей. Играем ту
     * порцию, что показана на обложке: страница при каждом
     * входе заново грузит выдачу (loadWave), так что буфер
     * всегда свежий и по кругу не ходим.
     */
    async function switchToWave(): Promise<void> {
        if (player.isLoading) return;

        if (waveTracks.value.length === 0) {
            await loadWave();

            if (waveTracks.value.length === 0) return;
        }

        await player.startWave(waveTracks.value, 0);
    }

    onMounted(() => {
        void loadWave();
    });

    onBeforeUnmount(() => {
        stopAuthStatusPoll();
    });

    return {
        waveTracks,
        waveLoading,
        waveError,
        isPlaying,
        heroDisplay,
        loadWave,
        playWave,
        switchToWave,
    };
}
