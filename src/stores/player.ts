import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';

import {
    getTrackAudio,
    type Track as ApiTrack,
} from '@/api/tracks';

export const usePlayerStore = defineStore('player', () => {
    // ============================================
    // СОСТОЯНИЕ
    // ============================================

    type PlayerTrack = {
        id: number | string;
        title: string;
        artist: string;
        cover?: string;
        symbol?: string;
        source?: string;
    };
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

        progress.value = audio.currentTime || 0;
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

        void playNext();
    });


    /**
     * Установить очередь воспроизведения.
     */
    function setQueue(tracks: ApiTrack[]): void {
        queue.value = [...tracks];
    }

    /**
     * Переключить на следующий трек.
     */
    async function playNext(): Promise<void> {
        if (!queue.value.length) {
            return;
        }

        const nextIndex = currentTrackIndex.value + 1;

        // В конце очереди останавливаем воспроизведение.
        if (nextIndex >= queue.value.length) {
            isPlaying.value = false;
            return;
        }

        await playTrack(queue.value[nextIndex]);
    }

    /**
     * Переключить на предыдущий трек.
     */
    async function playPrevious(): Promise<void> {
        if (!queue.value.length) {
            return;
        }

        // Если трек играет больше 3 секунд, начинаем его сначала.
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

        const index = queue.value.findIndex(
            (item) => item.id === track.id,
        );

        if (index !== -1) {
            currentTrackIndex.value = index;
        }
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

        liked.value = false;
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

            if (requestId !== playbackRequestId) {
                return;
            }


            // Устанавливаем адрес файла.
            audio.src = audioFile.url;
            audio.volume = volume.value / 100;

            // Запускаем загрузку аудио.
            audio.load();


            await audio.play();

        } catch (err) {
            if (requestId !== playbackRequestId) {
                return;
            }

            console.error('Ошибка воспроизведения:', err);
            console.error('Audio error:', audio.error);
            console.error('Audio src:', audio.currentSrc || audio.src);

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
        if (!currentTrack.value || isLoading.value) {
            return;
        }

        if (audio.paused) {
            try {
                await audio.play();
            } catch (error) {
                console.error('Ошибка воспроизведения:', error);
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

    const progressPercent = computed(() => {
        if (audioDuration.value <= 0) {
            return 0;
        }

        return Math.min(
            100,
            (progress.value / audioDuration.value) * 100,
        );
    });

    return {
        currentTrack,
        isPlaying,
        isLoading,
        progress,
        audioDuration,
        volume,
        liked,
        favoriteLoading,
        isSeeking,
        progressPercent,
        playTrack,
        togglePlay,
        seekAudio,
        formatTime,
    };
});