import {
    computed,
    ref,
    watch,
    onBeforeUnmount,
} from 'vue';

import {searchTracks,} from '@/api/search';
import {type Track,} from '@/types/TrackType';
const sourceList = "search";


import {
    getFavorites,
    addFavorite,
    removeFavorite,
} from '@/api/favorites';

import usePlayerStore from '@/stores/player';

import {
    searchOutline,
    closeOutline,
    trendingUpOutline,
    musicalNotesOutline,
    playOutline,
    pauseOutline,
    informationCircleOutline,
    heart,
} from 'ionicons/icons';

// ============================================
// ТИПЫ
// ============================================

type SearchTrack = Track & {
    color: string;
};

// ============================================
// ОСНОВНАЯ ЛОГИКА ПОИСКА
// ============================================

export function useSearch() {
    // ==========================================
    // СОСТОЯНИЕ
    // ==========================================

    const player = usePlayerStore();

    const query = ref('');

    const activeFilter = ref('all');


    const tracks = ref<SearchTrack[]>([]);

    const searchLoading = ref(false);

    const searchError = ref('');

    let searchTimeout: ReturnType<typeof setTimeout> | undefined;

    let searchRequestId = 0;

    const activeSource = ref<SearchSource>('all');

    const sourceFilters: {
        label: string;
        value: SearchSource;
    }[] = [
        { label: 'Все', value: 'all' },
        { label: 'Загрузки', value: 'upload' },
        { label: 'Яндекс Музыка', value: 'yandex_music' },
        { label: 'Internet Archive', value: 'internet_archive' },
    ];

    // ==========================================
    // ГЛОБАЛЬНЫЙ МУЗЫКАЛЬНЫЙ ПЛЕЕР
    // ==========================================

    /**
     * Текущий трек глобального плеера,
     * если он присутствует в результатах поиска.
     *
     * Сравниваем ID как строки, чтобы избежать
     * несовпадения number и string.
     */
    const currentTrack = computed<SearchTrack | null>(() => {
        const currentId = player.currentTrack?.id;

        if (currentId == null) {
            return null;
        }

        return tracks.value.find(
            (track) => String(track.id) === String(currentId),
        ) ?? null;
    });

    /**
     * Реальное состояние глобального плеера.
     */
    const isPlaying = computed(() => player.isPlaying);

    /**
     * Проверяет, воспроизводится ли конкретный трек.
     *
     * Работает независимо от страницы, на которой
     * пользователь запустил музыку.
     */
    function isTrackPlaying(track: SearchTrack): boolean {
        return (
            player.currentTrack != null &&
            String(player.currentTrack.id) === String(track.id) &&
            player.isPlaying
        );
    }

    /**
     * Проверяет, выбран ли трек глобальным плеером.
     *
     * В отличие от isTrackPlaying(), возвращает true
     * и на паузе. Это позволяет отдельно оформлять
     * текущий трек и реально воспроизводимый трек.
     */
    function isCurrentTrack(track: SearchTrack): boolean {
        return (
            player.currentTrack != null &&
            String(player.currentTrack.id) === String(track.id)
        );
    }

    // ==========================================
    // ВОСПРОИЗВЕДЕНИЕ
    // ==========================================

    /**
     * Воспроизвести трек из поиска через глобальный плеер.
     */
    async function playTrack(track: SearchTrack): Promise<void> {
        if (player.isLoading) {
            return;
        }

        const current = player.currentTrack;

        // Если выбран тот же трек, переключаем Play/Pause,
        // не запрашивая аудиофайл повторно.
        if (
            current &&
            String(current.id) === String(track.id)
        ) {
            await player.togglePlay(sourceList);
            return;
        }

        // Передаём результаты поиска в очередь.
        player.setQueue(tracks.value);

        // Воспроизводим трек через глобальный плеер.
        await player.playTrack(track, sourceList);
    }

    /**
     * Обработчик клика по строке трека.
     */
    async function onTrackClick(track: SearchTrack): Promise<void> {
        await playTrack(track);
    }

    // ==========================================
    // ФИЛЬТРЫ
    // ==========================================

    const filters = [
        { label: 'Всё', value: 'all' },
        { label: 'Треки', value: 'tracks' },
        { label: 'Исполнители', value: 'artists' },
        { label: 'Альбомы', value: 'albums' },
    ];

    const popularSearches = [
        'Популярная музыка',
        'Электроника',
        'Рок',
        'Для дороги',
    ];

    const genres = [
        { name: 'Электроника', color: '#6846C7' },
        { name: 'Рок', color: '#A64258' },
        { name: 'Хип-хоп', color: '#B76B32' },
        { name: 'Чилл', color: '#267E83' },
    ];

    const coverColors = [
        '#6546B8',
        '#277D8A',
        '#A04C72',
        '#B26A38',
        '#6846C7',
    ];

    // ==========================================
    // РЕЗУЛЬТАТЫ ПОИСКА
    // ==========================================
    const filteredTracks = computed(() => {
        if (
            !query.value.trim() ||
            activeFilter.value === 'artists' ||
            activeFilter.value === 'albums'
        ) {
            return [];
        }

        if (activeSource.value === 'all') {
            return tracks.value;
        }

        return tracks.value.filter(
            track => track.source_type === activeSource.value,
        );
    });

    type SearchSource =
        | 'all'
        | 'upload'
        | 'yandex_music'
        | 'internet_archive';

    // ==========================================
    // ВЫПОЛНЕНИЕ ПОИСКА
    // ==========================================

    async function performSearch(term: string): Promise<void> {
        const requestId = ++searchRequestId;

        searchLoading.value = true;

        searchError.value = '';

        try {
            const response = await searchTracks(term, 20);
            console.log('[Search] Ответ API:', response);
            console.log('[Search] Найдено треков:', response.data.length);

            // Игнорируем устаревшие ответы.
            if (requestId !== searchRequestId) {
                return;
            }

            tracks.value = response.data.map(
                (track, index) => ({
                    ...track,
                    color: coverColors[index % coverColors.length],
                }),
            );
        } catch (error) {
            if (requestId !== searchRequestId) {
                return;
            }

            console.error(
                'Ошибка поиска музыки:',
                error,
            );

            tracks.value = [];

            searchError.value =
                'Не удалось выполнить поиск. Попробуй ещё раз.';
        } finally {
            if (requestId === searchRequestId) {
                searchLoading.value = false;
            }
        }
    }

    // ==========================================
    // ПОВТОРНЫЙ ПОИСК
    // ==========================================

    function retrySearch(): void {
        const term = query.value.trim();

        if (term.length < 2) {
            return;
        }

        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        void performSearch(term);
    }

    // ==========================================
    // АВТОМАТИЧЕСКИЙ ПОИСК
    // ==========================================

    watch(query, (value) => {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        const term = value.trim();

        if (term.length < 2) {
            // Аннулируем предыдущие запросы.
            searchRequestId++;

            tracks.value = [];

            searchError.value = '';

            searchLoading.value = false;

            return;
        }

        // Ждём 400 мс после ввода.
        searchTimeout = setTimeout(() => {
            void performSearch(term);
        }, 400);
    });

    // ==========================================
    // ИЗБРАННОЕ
    // ==========================================

    const favoriteTrackIds = ref<Set<number>>(
        new Set(),
    );

    const favoriteLoadingIds = ref<Set<number>>(
        new Set(),
    );

    /**
     * Проверить, находится ли трек в избранном.
     */
    function isFavorite(trackId: number): boolean {
        return favoriteTrackIds.value.has(trackId);
    }

    // ==========================================
    // ЗАГРУЗКА ИЗБРАННОГО
    // ==========================================

    // async function loadFavorites(): Promise<void> {
    //     try {
    //         const response = await getFavorites();
    //
    //         favoriteTrackIds.value = new Set(
    //             response.data.map((track) => track.id),
    //         );
    //     } catch (error) {
    //         console.error(
    //             'Не удалось загрузить избранное:',
    //             error,
    //         );
    //     }
    // }

    // ==========================================
    // ДОБАВЛЕНИЕ И УДАЛЕНИЕ ИЗБРАННОГО
    // ==========================================

    async function toggleFavorite(
        track: SearchTrack,
    ): Promise<void> {
        const trackId = track.id;

        if (favoriteLoadingIds.value.has(trackId)) {
            return;
        }

        favoriteLoadingIds.value = new Set([
            ...favoriteLoadingIds.value,
            trackId,
        ]);

        try {
            if (isFavorite(trackId)) {
                await removeFavorite(trackId);

                const ids = new Set(
                    favoriteTrackIds.value,
                );

                ids.delete(trackId);

                favoriteTrackIds.value = ids;
            } else {
                await addFavorite(trackId);

                const ids = new Set(
                    favoriteTrackIds.value,
                );

                ids.add(trackId);

                favoriteTrackIds.value = ids;
            }
        } catch (error) {
            console.error(
                'Не удалось изменить избранное:',
                error,
            );
        } finally {
            const loadingIds = new Set(
                favoriteLoadingIds.value,
            );

            loadingIds.delete(trackId);

            favoriteLoadingIds.value = loadingIds;
        }
    }

    // ==========================================
    // ИНИЦИАЛИЗАЦИЯ
    // ==========================================

    // onMounted(() => {
    //     void loadFavorites();
    // });

    // ==========================================
    // ОЧИСТКА
    // ==========================================

    onBeforeUnmount(() => {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        // Игнорируем ответы поиска после ухода со страницы.
        searchRequestId++;
    });

    // ==========================================
    // ДАННЫЕ ДЛЯ КОМПОНЕНТА
    // ==========================================

    return {
        query,
        activeFilter,
        filters,
        popularSearches,
        genres,

        searchLoading,
        searchError,
        filteredTracks,
        activeSource,
        sourceFilters,

        // Глобальный плеер.
        currentTrack,
        isPlaying,
        isTrackPlaying,
        isCurrentTrack,

        // Управление воспроизведением.
        playTrack,
        onTrackClick,

        // Избранное.
        favoriteLoadingIds,
        isFavorite,
        toggleFavorite,

        // Повторный поиск.
        retrySearch,

        // Иконки.
        searchOutline,
        closeOutline,
        trendingUpOutline,
        musicalNotesOutline,
        playOutline,
        pauseOutline,
        informationCircleOutline,
        heart,
    };
}