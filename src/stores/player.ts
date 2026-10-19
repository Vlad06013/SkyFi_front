import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';

import {
    getTrackAudio,
    addFavorite,
    removeFavorite,
    checkFavorite,
    type Track as ApiTrack,
} from '@/api/tracks';

import { useAuthStore } from '@/stores/auth';

const usePlayerStore = defineStore('player', () => {
    // ============================================
    // ТИПЫ
    // ============================================

    type PlayerTrack = {
        id: number | string;
        title: string;
        artist: string;
        cover?: string;
        symbol?: string;
    };

    // ============================================
    // СОСТОЯНИЕ
    // ============================================

    const auth = useAuthStore();

    const queue = ref<ApiTrack[]>([]);

    const currentTrackIndex = ref(-1);

    const currentTrack = ref<PlayerTrack | null>(null);

    const isPlaying = ref(false);

    const isLoading = ref(false);

    const progress = ref(0);

    const audioDuration = ref(0);

    const volume = ref(70);

    const liked = ref(false);

    const favoriteLoading = ref(false);

    const isSeeking = ref(false);

    const audio = new Audio();

    audio.preload = 'metadata';
    audio.volume = volume.value / 100;

    let playbackRequestId = 0;

    // Идентификаторы запросов избранного.
    let favoriteCheckRequestId = 0;
    let favoriteToggleRequestId = 0;

    // ============================================
    // ГРОМКОСТЬ
    // ============================================

    watch(volume, (value) => {
        audio.volume = Math.max(0, Math.min(100, value)) / 100;
    });

    // ============================================
    // ОБРАБОТЧИКИ AUDIO
    // ============================================

    audio.addEventListener('timeupdate', () => {
        if (isSeeking.value) {
            return;
        }

        progress.value = Number.isFinite(audio.currentTime)
            ? audio.currentTime
            : 0;
    });

    audio.addEventListener('loadedmetadata', () => {
        audioDuration.value =
            Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.duration
                : 0;
    });

    audio.addEventListener('durationchange', () => {
        audioDuration.value =
            Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.duration
                : 0;
    });

    audio.addEventListener('play', () => {
        isPlaying.value = true;
    });

    audio.addEventListener('pause', () => {
        isPlaying.value = false;
    });

    audio.addEventListener('ended', () => {
        isPlaying.value = false;
        progress.value = audioDuration.value;

        if (currentTrackIndex.value < queue.value.length - 1) {
            void playNext();
        }
    });

    audio.addEventListener('error', () => {
        isPlaying.value = false;
    });

    // ============================================
    // ОЧЕРЕДЬ
    // ============================================

    /**
     * Установить очередь воспроизведения.
     */
    function setQueue(tracks: ApiTrack[]): void {
        queue.value = [...tracks];

        if (!currentTrack.value) {
            currentTrackIndex.value = -1;
            return;
        }

        currentTrackIndex.value = queue.value.findIndex(
            (track) =>
                String(track.id) === String(currentTrack.value?.id),
        );
    }

    /**
     * Очистить очередь воспроизведения.
     */
    function clearQueue(): void {
        console.trace('[Player] Вызван clearQueue()');

        queue.value = [];
        currentTrackIndex.value = -1;
    }

    /**
     * Найти индекс трека в очереди.
     */
    function findTrackIndex(track: ApiTrack): number {
        return queue.value.findIndex(
            (item) => String(item.id) === String(track.id),
        );
    }

    // ============================================
    // ИЗБРАННОЕ
    // ============================================

    /**
     * Проверить, находится ли трек в избранном.
     *
     * Используем идентификатор запроса, чтобы ответ
     * для предыдущего трека не перезаписал состояние
     * текущего.
     */
    async function updateFavoriteState(
        trackId: number | string | null,
    ): Promise<void> {
        const requestId = ++favoriteCheckRequestId;

        if (trackId === null) {
            liked.value = false;
            return;
        }

        if (typeof trackId !== 'number') {
            liked.value = false;
            return;
        }

        if (!auth.user) {
            liked.value = false;
            return;
        }

        try {
            const response = await checkFavorite(trackId);

            if (requestId !== favoriteCheckRequestId) {
                return;
            }

            if (
                String(currentTrack.value?.id) !== String(trackId)
            ) {
                return;
            }

            liked.value = response.is_favorite;
        } catch (error) {
            if (requestId !== favoriteCheckRequestId) {
                return;
            }

            console.error(
                '[Player] Не удалось проверить избранное:',
                error,
            );

            liked.value = false;
        }
    }

    /**
     * Добавить текущий трек в избранное
     * или удалить его из избранного.
     */
    async function toggleFavorite(): Promise<void> {
        const track = currentTrack.value;

        if (
            !track ||
            favoriteLoading.value ||
            typeof track.id !== 'number'
        ) {
            return;
        }

        if (!auth.user) {
            console.warn(
                '[Player] Для работы с избранным необходимо авторизоваться.',
            );
            return;
        }

        const trackId = track.id;
        const wasLiked = liked.value;

        const requestId = ++favoriteToggleRequestId;

        favoriteLoading.value = true;

        try {
            const response = wasLiked
                ? await removeFavorite(trackId)
                : await addFavorite(trackId);

            // Не меняем лайк, если запрос уже устарел
            // или пользователь переключился на другой трек.
            if (requestId !== favoriteToggleRequestId) {
                return;
            }

            if (
                String(currentTrack.value?.id) !== String(trackId)
            ) {
                return;
            }

            liked.value = response.is_favorite;
        } catch (error) {
            console.error(
                '[Player] Ошибка изменения избранного:',
                error,
            );
        } finally {
            if (requestId === favoriteToggleRequestId) {
                favoriteLoading.value = false;
            }
        }
    }

    // ============================================
    // СЛЕДУЮЩИЙ ТРЕК
    // ============================================

    async function playNext(): Promise<void> {
        if (isLoading.value || queue.value.length === 0) {
            return;
        }

        const nextIndex = currentTrackIndex.value + 1;

        if (nextIndex >= queue.value.length) {
            audio.pause();
            isPlaying.value = false;
            return;
        }

        await playTrack(queue.value[nextIndex]);
    }

    // ============================================
    // ПРЕДЫДУЩИЙ ТРЕК
    // ============================================

    async function playPrevious(): Promise<void> {
        if (isLoading.value || queue.value.length === 0) {
            return;
        }

        // Если текущий трек играет больше 3 секунд,
        // начинаем его сначала.
        if (audio.currentTime > 3) {
            seekAudio(0);
            return;
        }

        const previousIndex = currentTrackIndex.value - 1;

        if (previousIndex < 0) {
            seekAudio(0);
            return;
        }

        await playTrack(queue.value[previousIndex]);
    }

    // ============================================
    // ВОСПРОИЗВЕДЕНИЕ
    // ============================================

    async function playTrack(track: ApiTrack): Promise<void> {
        if (!track) {
            return;
        }

        // Если очередь пуста, добавляем выбранный трек.
        if (queue.value.length === 0) {
            console.warn(
                '[Player] Очередь пуста при выборе трека:',
                track.title,
            );

            queue.value = [track];
        }

        const index = findTrackIndex(track);

        currentTrackIndex.value = index;

        console.log('[Player] Выбран трек:', track.title);
        console.log('[Player] ID трека:', track.id);
        console.log('[Player] Индекс:', index);
        console.log('[Player] Размер очереди:', queue.value.length);

        // Отменяем предыдущие запросы воспроизведения.
        const requestId = ++playbackRequestId;

        currentTrack.value = {
            id: track.id,
            title: track.title,
            artist:
                track.artists
                    ?.map((artist) => artist.name)
                    .join(', ') || 'Неизвестный исполнитель',
            cover: 'cover-purple',
            symbol: '♫',
        };

        // Сбрасываем состояние избранного и проверяем
        // его для нового трека.
        liked.value = false;

        void updateFavoriteState(track.id);

        isPlaying.value = false;
        isLoading.value = true;

        progress.value = 0;
        audioDuration.value = 0;
        isSeeking.value = false;

        audio.pause();
        audio.removeAttribute('src');
        audio.load();

        try {
            const audioFile = await getTrackAudio(track.id);

            // Если пользователь выбрал другой трек,
            // игнорируем устаревший запрос.
            if (requestId !== playbackRequestId) {
                return;
            }

            if (!audioFile?.url) {
                throw new Error(
                    'Сервер не вернул ссылку на аудиофайл.',
                );
            }

            audio.src = audioFile.url;

            audio.volume = Math.max(
                0,
                Math.min(100, volume.value),
            ) / 100;

            audio.load();

            await audio.play();
        } catch (error) {
            if (requestId !== playbackRequestId) {
                return;
            }

            console.error(
                '[Player] Ошибка воспроизведения трека:',
                error,
            );

            isPlaying.value = false;
        } finally {
            if (requestId === playbackRequestId) {
                isLoading.value = false;
            }
        }
    }

    // ============================================
    // PLAY / PAUSE
    // ============================================

    async function togglePlay(): Promise<void> {
        if (isLoading.value) {
            return;
        }

        if (!currentTrack.value) {
            const firstTrack = queue.value[0];

            if (firstTrack) {
                await playTrack(firstTrack);
            }

            return;
        }

        if (audio.paused) {
            try {
                await audio.play();
            } catch (error) {
                console.error(
                    '[Player] Ошибка продолжения воспроизведения:',
                    error,
                );

                isPlaying.value = false;
            }
        } else {
            audio.pause();
        }
    }

    // ============================================
    // ПЕРЕМОТКА
    // ============================================

    function seekAudio(value: number): void {
        if (
            !Number.isFinite(audio.duration) ||
            audio.duration <= 0
        ) {
            return;
        }

        const target = Math.max(
            0,
            Math.min(value, audio.duration),
        );

        audio.currentTime = target;

        progress.value = target;

        isSeeking.value = false;
    }

    // ============================================
    // ВРЕМЯ
    // ============================================

    function formatTime(value: number): string {
        if (!Number.isFinite(value) || value < 0) {
            return '0:00';
        }

        const seconds = Math.floor(value);
        const minutes = Math.floor(seconds / 60);
        const remainder = seconds % 60;

        return `${minutes}:${String(remainder).padStart(2, '0')}`;
    }

    // ============================================
    // ПРОГРЕСС
    // ============================================

    const progressPercent = computed(() => {
        if (audioDuration.value <= 0) {
            return 0;
        }

        return Math.min(
            100,
            (progress.value / audioDuration.value) * 100,
        );
    });

    // ============================================
    // СИНХРОНИЗАЦИЯ ИЗБРАННОГО
    // ============================================

    watch(
        () => currentTrack.value?.id,
        (trackId) => {
            if (trackId == null) {
                liked.value = false;
                favoriteCheckRequestId++;
                return;
            }

            void updateFavoriteState(trackId);
        },
    );

    // ============================================
    // ЭКСПОРТ
    // ============================================

    return {
        // Очередь
        queue,
        currentTrackIndex,
        setQueue,
        clearQueue,

        // Текущий трек
        currentTrack,

        // Состояние воспроизведения
        isPlaying,
        isLoading,

        // Прогресс и время
        progress,
        audioDuration,
        progressPercent,

        // Громкость
        volume,

        // Избранное
        liked,
        favoriteLoading,
        updateFavoriteState,
        toggleFavorite,

        // Перемотка
        isSeeking,
        seekAudio,

        // Управление воспроизведением
        playTrack,
        playNext,
        playPrevious,
        togglePlay,

        // Форматирование
        formatTime,
    };
});

export default usePlayerStore;