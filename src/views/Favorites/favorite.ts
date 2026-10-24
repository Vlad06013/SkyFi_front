import {
    computed,
    onMounted,
    reactive,
    ref,
} from 'vue';
import { useAuthStore } from '@/stores/auth';
import {
    getCachedCollection,
    saveCachedCollection,
} from '@/db/appDatabase';

import {
    musicalNotesOutline,
    discOutline,
    cloudUploadOutline,
    checkmarkCircleOutline,
    alertCircleOutline,
    informationCircleOutline,
    chevronForwardOutline,
    refreshOutline,
    playOutline,
    pauseOutline,
    peopleOutline,
} from 'ionicons/icons';

import axios from 'axios';


import type {Track} from '@/types/TrackType';
import {getFavorites} from '@/api/favorites';

import usePlayerStore from '@/stores/player';

// ============================================
// ТИПЫ
// ============================================

type LibraryTab = 'tracks' | 'albums' | 'artists' | 'upload';

interface Album {
    id: number;
    title: string;
    tracksCount: number;
    tracks: Track[];
}

interface LibraryArtist {
    id: number;
    name: string;
    tracksCount: number;
    tracks: Track[];
}



// ============================================
// ЛОГИКА БИБЛИОТЕКИ
// ============================================

export function useLibrary() {
    // ============================================
    // ПЛЕЕР
    // ============================================

    const player = usePlayerStore();

    const playerIsPlaying = computed(
        () => player.isPlaying,
    );

    const currentTrackId = computed<number | null>(() => {
        const currentTrack = player.currentTrack;

        if (
            !currentTrack ||
            currentTrack.id === undefined ||
            currentTrack.id === null
        ) {
            return null;
        }

        const id = Number(currentTrack.id);

        return Number.isFinite(id) ? id : null;
    });

    /**
     * Сравниваем числовые ID.
     *
     * Например, 12 и "12" должны считаться одним треком.
     */
    function isCurrentTrack(track: Track): boolean {
        if (
            !track ||
            track.id === undefined ||
            track.id === null
        ) {
            return false;
        }

        return currentTrackId.value === Number(track.id);
    }


// ============================================
// ИЗБРАННОЕ + ЛОКАЛЬНЫЙ КЕШ DEXIE
// ============================================

    const auth = useAuthStore();

    const tracks = ref<Track[]>([]);
    const loading = ref(false);
    const error = ref('');

    let libraryRequestId = 0;

    const FAVORITES_CACHE_KEY = 'favorites';

    async function loadLibrary(): Promise<void> {
        const requestId = ++libraryRequestId;
        const userId = auth.user?.id;

        loading.value = true;
        error.value = '';

        // Сначала показываем локальный кеш текущего пользователя.
        if (userId !== undefined && userId !== null) {
            try {
                const cached = await getCachedCollection(
                    FAVORITES_CACHE_KEY,
                    String(userId),
                );

                if (requestId !== libraryRequestId) {
                    return;
                }

                if (cached && Array.isArray(cached.tracks)) {
                    tracks.value = cached.tracks.map(item => item.track);


                }
            } catch (cacheError) {
                console.warn(
                    '[Library] Не удалось прочитать кеш избранного:',
                    cacheError,
                );
            }
        }

        try {
            const favorites = await getFavorites();

            if (requestId !== libraryRequestId) {
                return;
            }

            if (!Array.isArray(favorites)) {
                throw new Error(
                    'Сервер вернул данные избранного в неизвестном формате.',
                );
            }

            // Сервер — источник актуальных данных.
            tracks.value = favorites;

            // Сохраняем свежий список в IndexedDB.
            if (userId !== undefined && userId !== null) {
                await saveCachedCollection({
                    key: FAVORITES_CACHE_KEY,
                    userId: String(userId),
                    updatedAt: Date.now(),
                    tracks: favorites.map((track, index) => ({
                        id: Number(track.id),
                        position: index,
                        track,
                    })),
                });
            }


        } catch (err: unknown) {
            if (requestId !== libraryRequestId) {
                return;
            }

            console.error(
                '[Library] Ошибка синхронизации избранного:',
                err,
            );

            if (tracks.value.length === 0) {
                if (axios.isAxiosError(err)) {
                    if (err.response?.status === 401) {
                        error.value =
                            'Войди в аккаунт, чтобы просматривать избранное.';
                    } else if (!err.response) {
                        error.value =
                            'Нет подключения к серверу и локального кеша избранного.';
                    } else {
                        error.value =
                            err.response.data?.message ||
                            'Не удалось загрузить избранное.';
                    }
                } else {
                    error.value = err instanceof Error
                        ? err.message
                        : 'Не удалось получить данные избранного.';
                }
            }
        } finally {
            if (requestId === libraryRequestId) {
                loading.value = false;
            }
        }
    }



    // ============================================
    // ВКЛАДКИ
    // ============================================

    const tabs: {
        label: string;
        value: LibraryTab;
        icon?: string;
    }[] = [
        {
            label: 'Треки',
            value: 'tracks',
            icon: musicalNotesOutline,
        },
        {
            label: 'Альбомы',
            value: 'albums',
            icon: discOutline,
        },
        {
            label: 'Исполнители',
            value: 'artists',
            icon: peopleOutline,
        },
    ];

    const activeTab = ref<LibraryTab>('tracks');

    // ============================================
    // ЗАГРУЗКА ТРЕКА
    // ============================================

    // const fileInput = ref<HTMLInputElement | null>(null);
    // const selectedFile = ref<File | null>(null);

    // const fieldErrors = reactive<Record<string, string>>({});


    // ============================================
    // ВОСПРОИЗВЕДЕНИЕ МУЗЫКИ
    // ============================================

    /**
     * Главная функция воспроизведения.
     *
     * Сначала устанавливает очередь.
     * Затем передаёт выбранный трек в хранилище плеера.
     */
    async function playTrack(
        track: Track,
        queue: Track[] = tracks.value,
    ): Promise<void> {
        console.log('[Library] playTrack вызван:', {
            track,
            queueLength: queue.length,
        });

        if (
            !track ||
            track.id === undefined ||
            track.id === null
        ) {
            console.error(
                '[Library] Воспроизведение отменено: у трека нет ID.',
                track,
            );

            return;
        }

        try {
            // Не допускаем пустую очередь.
            const validQueue = Array.isArray(queue)
                ? [...queue]
                : [];

            // Если выбранного трека нет в очереди, добавляем его.
            const trackExists = validQueue.some(
                item => Number(item.id) === Number(track.id),
            );

            if (!trackExists) {
                validQueue.unshift(track);
            }

            console.log(
                '[Library] Устанавливаем очередь:',
                validQueue,
            );

            player.setQueue(validQueue);

            console.log(
                '[Library] Запускаем воспроизведение:',
                track.id,
            );

            await player.playTrack(track);

            console.log(
                '[Library] Вызов плеера завершён.',
            );
        } catch (err: unknown) {
            console.error(
                '[Library] Ошибка воспроизведения:',
                err,
            );

            throw err;
        }
    }

    // ============================================
    // ДОБАВЛЕНИЕ В ОЧЕРЕДЬ
    // ============================================

    const queueLoadingTrackId = ref<number | null>(null);

    // ============================================
    // АЛЬБОМЫ
    // ============================================

    const albums = computed<Album[]>(() => {
        const result = new Map<number, Album>();

        for (const track of tracks.value) {
            if (!track.album) {
                continue;
            }

            const albumId = (
                track as Track & {
                    album_id?: number | null;
                }
            ).album_id ?? track.album.id;

            if (
                albumId === undefined ||
                albumId === null
            ) {
                continue;
            }

            const normalizedAlbumId = Number(albumId);

            if (!Number.isFinite(normalizedAlbumId)) {
                continue;
            }

            const existing = result.get(normalizedAlbumId);

            if (existing) {
                existing.tracksCount++;
                existing.tracks.push(track);
            } else {
                result.set(normalizedAlbumId, {
                    id: normalizedAlbumId,
                    title: track.album.title,
                    tracksCount: 1,
                    tracks: [track],
                });
            }
        }

        return Array.from(result.values()).sort(
            (a, b) => a.title.localeCompare(b.title, 'ru'),
        );
    });

    // ============================================
    // ИСПОЛНИТЕЛИ
    // ============================================

    const artists = computed<LibraryArtist[]>(() => {
        const result = new Map<number, LibraryArtist>();

        for (const track of tracks.value) {
            for (const artist of track.artists ?? []) {
                const artistId = Number(artist.id);

                if (!Number.isFinite(artistId)) {
                    continue;
                }

                const existing = result.get(artistId);

                if (existing) {
                    existing.tracksCount++;
                    existing.tracks.push(track);
                } else {
                    result.set(artistId, {
                        id: artistId,
                        name: artist.name,
                        tracksCount: 1,
                        tracks: [track],
                    });
                }
            }
        }

        return Array.from(result.values()).sort(
            (a, b) => a.name.localeCompare(b.name, 'ru'),
        );
    });

    // ============================================
    // ВОСПРОИЗВЕДЕНИЕ АЛЬБОМА
    // ============================================

    function playAlbum(album: Album): void {
        const firstTrack = album.tracks[0];

        if (firstTrack) {
            void playTrack(firstTrack, album.tracks);
        }
    }

    // ============================================
    // ВОСПРОИЗВЕДЕНИЕ ИСПОЛНИТЕЛЯ
    // ============================================

    function playArtist(artistId: number): void {
        const artist = artists.value.find(
            item => Number(item.id) === Number(artistId),
        );

        if (!artist || artist.tracks.length === 0) {
            console.warn(
                '[Library] У исполнителя нет треков:',
                artistId,
            );

            return;
        }

        const firstTrack = artist.tracks[0];

        void playTrack(firstTrack, artist.tracks);
    }

    // ============================================
    // ОФОРМЛЕНИЕ
    // ============================================

    const coverColors = [
        '#6546B8',
        '#277D8A',
        '#A04C72',
        '#B26A38',
        '#3569A8',
        '#47865C',
        '#8157A6',
        '#B64E61',
        '#4B65B5',
        '#337E75',
    ];

    function getTrackColor(id: number | string): string {
        const normalizedId = Number(id);

        if (!Number.isFinite(normalizedId)) {
            return coverColors[0];
        }

        const index =
            Math.abs(normalizedId) % coverColors.length;

        return coverColors[index];
    }

    function pluralizeTracks(count: number): string {
        const lastTwo = count % 100;

        if (lastTwo >= 11 && lastTwo <= 14) {
            return 'треков';
        }

        const lastDigit = count % 10;

        if (lastDigit === 1) {
            return 'трек';
        }

        if (lastDigit >= 2 && lastDigit <= 4) {
            return 'трека';
        }

        return 'треков';
    }

    // ============================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================

    onMounted(() => {
        void loadLibrary();
    });


    // ============================================
    // ПУБЛИЧНЫЙ API
    // ============================================

    return {
        tabs,
        activeTab,

        // Избранное
        tracks,
        loading,
        error,
        loadLibrary,

        // Собственные загрузки


        // Форма загрузки

        // fieldErrors,
        // selectedFile,
        // fileInput,



        // Коллекции
        albums,
        artists,

        // Плеер
        isCurrentTrack,
        playerIsPlaying,
        playTrack,
        playAlbum,
        playArtist,

        // Очередь
        queueLoadingTrackId,

        // Оформление
        getTrackColor,
        pluralizeTracks,

        // Иконки
        musicalNotesOutline,
        discOutline,
        cloudUploadOutline,
        checkmarkCircleOutline,
        alertCircleOutline,
        informationCircleOutline,
        chevronForwardOutline,
        refreshOutline,
        playOutline,
        pauseOutline,
        peopleOutline,
    };
}