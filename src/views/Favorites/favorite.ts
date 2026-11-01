import {
    computed,
    onMounted,
    reactive,
    ref,
    toRaw,
    watch,
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
import {getFavorites, updateFavoritesSort} from '@/api/favorites';

import usePlayerStore from '@/stores/player';
import {PlaySourceListsEnum} from '@/types/PlaySourceListsEnum';

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

    // Время последней загрузки списка с сервера. Инициализируем
    // временем входа, чтобы восстановление плеера (liked)
    // не дублировало запрос избранного при старте.
    let favoritesLoadedAt = Date.now();

    async function loadLibrary(): Promise<void> {
        const requestId = ++libraryRequestId;
        const userId = auth.user?.id;

        // Полноэкранный спиннер только при первой загрузке,
        // повторные подгрузки идут в фоне, чтобы список не мигал.
        loading.value = tracks.value.length === 0;
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
            favoritesLoadedAt = Date.now();

            // Сохраняем свежий список в IndexedDB. Проблемы кеша
            // не должны выглядеть как ошибка синхронизации.
            try {
                await persistFavoritesCache();
            } catch (cacheError) {
                console.warn(
                    '[Library] Не удалось обновить кеш избранного:',
                    cacheError,
                );
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



    /**
     * Сохранить текущий список избранного в локальный кеш.
     */
    async function persistFavoritesCache(): Promise<void> {
        const userId = auth.user?.id;

        if (userId === undefined || userId === null) {
            return;
        }

        await saveCachedCollection({
            key: FAVORITES_CACHE_KEY,
            userId: String(userId),
            updatedAt: Date.now(),
            tracks: tracks.value.map((track, index) => ({
                id: Number(track.id),
                position: index,
                // IndexedDB не умеет клонировать реактивные
                // прокси Vue — сохраняем сырые объекты.
                track: toRaw(track),
            })),
        });
    }

    /**
     * Переставить трек избранного на новую позицию (drag & drop).
     *
     * Порядок меняется оптимистично, затем сохраняется на сервере.
     * При ошибке локальный порядок откатывается.
     */
    async function reorderFavorites(
        fromIndex: number,
        toIndex: number,
    ): Promise<void> {
        const list = tracks.value;
        const lastIndex = list.length - 1;

        if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            fromIndex > lastIndex ||
            toIndex < 0 ||
            toIndex > lastIndex
        ) {
            return;
        }

        const snapshot = [...list];
        const reordered = [...list];
        const [moved] = reordered.splice(fromIndex, 1);

        reordered.splice(toIndex, 0, moved);

        // Сервер сортирует по sort DESC: верхний трек получает
        // самое большое значение, нижний — ноль.
        const sorts = reordered.map((track, index) => ({
            track_id: Number(track.id),
            sort: reordered.length - 1 - index,
        }));

        tracks.value = reordered;

        try {
            await updateFavoritesSort(sorts);
        } catch (err) {
            console.error(
                '[Library] Не удалось сохранить порядок избранного:',
                err,
            );

            tracks.value = snapshot;

            return;
        }

        // Порядок уже сохранён на сервере: приводим локальные sort
        // к новым значениям, даже если кеш обновить не удалось.
        reordered.forEach((track, index) => {
            track.sort = sorts[index].sort;
        });

        try {
            await persistFavoritesCache();
        } catch (cacheError) {
            console.warn(
                '[Library] Не удалось обновить кеш избранного:',
                cacheError,
            );
        }
    }

    /**
     * Переместить трек избранного в начало списка.
     *
     * Значения sort пересчитываются для всего списка,
     * как при перетаскивании.
     */
    async function moveFavoriteToTop(track: Track): Promise<void> {
        const index = tracks.value.findIndex(
            item => Number(item.id) === Number(track.id),
        );

        if (index <= 0) {
            return;
        }

        await reorderFavorites(index, 0);
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

            await player.playTrack(
                track,
                PlaySourceListsEnum.FAVORITES,
            );

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

    // При возврате на вкладку треков подтягиваем свежий список:
    // избранное могло измениться на других экранах.
    watch(activeTab, (tab) => {
        if (tab === 'tracks') {
            void loadLibrary();
        }
    });

    // Лайк текущего трека с плеера: подтягиваем список, чтобы трек
    // появился сразу. Без guard-ов восстановление плеера при входе
    // дублировало бы запрос избранного.
    watch(
        () => player.liked,
        (liked) => {
            if (!liked || activeTab.value !== 'tracks') {
                return;
            }

            const currentId = Number(player.currentTrack?.id);

            const alreadyInList = tracks.value.some(
                track => Number(track.id) === currentId,
            );

            const fresh = Date.now() - favoritesLoadedAt < 10_000;

            if (!alreadyInList && !fresh) {
                void loadLibrary();
            }
        },
    );


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
        reorderFavorites,
        moveFavoriteToTop,

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