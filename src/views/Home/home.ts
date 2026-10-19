import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';
import { useAuthStore } from '@/stores/auth';

import {
    getTracks,
    getTrackAudio,
    searchExternalTracks,
    addFavorite,
    removeFavorite,
    checkFavorite,
    type Track as ApiTrack,
    type ExternalTrack,
} from '@/api/tracks';

import {
    computed,
    ref,
    watch,
    onMounted,
    onBeforeUnmount,
} from 'vue';

// ============================================
// ТИПЫ
// ============================================

type PlayerTrack = {
    id: string | number;
    title: string;
    artist: string;
    cover?: string;
    symbol?: string;
    tag?: string;
    audioUrl?: string;
    archiveIdentifier?: string;
};

// ============================================
// COMPOSABLE
// ============================================

export function useHome() {
    const router = useRouter();
    const auth = useAuthStore();
    const player = usePlayerStore();

    // ========================================
    // МЕНЮ
    // ========================================

    const menu = [
        { id: 'home', icon: '⌂', label: 'Главная' },
        { id: 'search', icon: '⌕', label: 'Поиск' },
        { id: 'library', icon: '♫', label: 'Моя музыка' },
        { id: 'playlists', icon: '▤', label: 'Плейлисты' },
    ];

    const activeMenu = ref('home');

    // ========================================
    // СОСТОЯНИЕ ПРИЛОЖЕНИЯ
    // ========================================

    const search = ref('');

    const currentTrack = ref<PlayerTrack | null>(null);

    const isPlaying = ref(false);

    const liked = ref(false);

    const favoriteLoading = ref(false);

    const progress = ref(0);

    const audioDuration = ref(0);

    const isSeeking = ref(false);

    const seekPosition = ref(0);

    const volume = ref(70);

    const profileMenuOpen = ref(false);

    const loggingOut = ref(false);

    const logoutError = ref('');

    let favoriteRequestId = 0;

    // ========================================
    // АУДИО
    // ========================================

    const audio = new Audio();

    audio.preload = 'metadata';
    audio.volume = volume.value / 100;

    watch(volume, (value) => {
        audio.volume = Math.max(0, Math.min(100, value)) / 100;
    });

    // ========================================
    // ТРЕКИ
    // ========================================

    const tracks = ref<ApiTrack[]>([]);

    const tracksLoading = ref(false);

    const tracksError = ref('');

    const externalTracks = ref<ExternalTrack[]>([]);

    const externalSearchLoading = ref(false);

    const externalSearchError = ref('');

    const filteredTracks = computed(() => {
        return search.value.trim()
            ? externalTracks.value
            : tracks.value;
    });

    // ========================================
    // ПОИСК
    // ========================================

    let searchTimeout: ReturnType<typeof setTimeout> | undefined;

    let searchRequestId = 0;

    async function performExternalSearch(
        query: string,
    ): Promise<void> {
        const normalizedQuery = query.trim();

        if (!normalizedQuery) {
            externalTracks.value = [];
            externalSearchError.value = '';
            externalSearchLoading.value = false;
            return;
        }

        const requestId = ++searchRequestId;

        externalSearchLoading.value = true;
        externalSearchError.value = '';

        try {
            const response = await searchExternalTracks(
                normalizedQuery,
                20,
            );

            if (requestId !== searchRequestId) {
                return;
            }

            externalTracks.value = response.data ?? [];
        } catch (error) {
            if (requestId !== searchRequestId) {
                return;
            }

            console.error(
                'Ошибка поиска Internet Archive:',
                error,
            );

            externalSearchError.value =
                'Не удалось выполнить поиск музыки. Попробуй ещё раз.';

            externalTracks.value = [];
        } finally {
            if (requestId === searchRequestId) {
                externalSearchLoading.value = false;
            }
        }
    }

    watch(search, (value) => {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        const query = value.trim();

        if (!query) {
            searchRequestId++;

            externalTracks.value = [];

            externalSearchError.value = '';

            externalSearchLoading.value = false;

            return;
        }

        searchTimeout = setTimeout(() => {
            void performExternalSearch(query);
        }, 400);
    });

    // ========================================
    // ИЗБРАННОЕ
    // ========================================

    async function updateFavoriteState(
        track: ApiTrack | null,
    ): Promise<void> {
        const requestId = ++favoriteRequestId;

        liked.value = false;

        if (!track) {
            return;
        }

        try {
            const response = await checkFavorite(track.id);

            if (requestId !== favoriteRequestId) {
                return;
            }

            if (
                !currentTrack.value ||
                String(currentTrack.value.id) !== String(track.id)
            ) {
                return;
            }

            liked.value = response.is_favorite;
        } catch (error) {
            if (requestId !== favoriteRequestId) {
                return;
            }

            liked.value = false;

            console.error(
                'Не удалось проверить избранное:',
                error,
            );
        }
    }

    async function toggleFavorite(): Promise<void> {
        const track = currentTrack.value;

        if (!track || favoriteLoading.value) {
            return;
        }

        if (typeof track.id !== 'number') {
            console.info(
                'Избранное доступно для треков из каталога SkyFi.',
            );

            return;
        }

        if (!auth.user) {
            console.warn(
                'Для работы с избранным необходимо авторизоваться.',
            );

            return;
        }

        const trackId = track.id;

        const wasLiked = liked.value;

        favoriteLoading.value = true;

        try {
            if (wasLiked) {
                await removeFavorite(trackId);
            } else {
                await addFavorite(trackId);
            }

            if (
                currentTrack.value &&
                String(currentTrack.value.id) === String(trackId)
            ) {
                liked.value = !wasLiked;
            }
        } catch (error) {
            console.error(
                'Ошибка изменения избранного:',
                error,
            );
        } finally {
            favoriteLoading.value = false;
        }
    }

    // ========================================
    // ОБРАБОТЧИКИ АУДИО
    // ========================================

    function handleTimeUpdate(): void {
        if (isSeeking.value) {
            return;
        }

        if (!Number.isFinite(audio.currentTime)) {
            return;
        }

        progress.value = audio.currentTime;
    }

    function handleLoadedMetadata(): void {
        audioDuration.value =
            Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.duration
                : 0;

        if (!isSeeking.value) {
            progress.value = audio.currentTime || 0;
        }
    }

    function handleDurationChange(): void {
        audioDuration.value =
            Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.duration
                : 0;
    }

    function handlePlay(): void {
        isPlaying.value = true;
    }

    function handlePause(): void {
        isPlaying.value = false;
    }

    function handleEnded(): void {
        isPlaying.value = false;
        progress.value = audioDuration.value;
    }

    function handleAudioError(): void {
        isPlaying.value = false;

        console.error(
            'Не удалось загрузить или воспроизвести аудиофайл.',
        );
    }

    // ========================================
    // ЗАГРУЗКА ТРЕКОВ
    // ========================================

    async function loadTracks(): Promise<void> {
        tracksLoading.value = true;

        tracksError.value = '';

        try {
            const response = await getTracks();

            tracks.value = response.data ?? [];

            console.log(
                'Загруженные треки SkyFi:',
                tracks.value,
            );
        } catch (error) {
            console.error(
                'Ошибка загрузки треков:',
                error,
            );

            tracksError.value =
                'Не удалось загрузить треки. Проверь подключение и попробуй ещё раз.';

            tracks.value = [];
        } finally {
            tracksLoading.value = false;
        }
    }

    // ========================================
    // НАВИГАЦИЯ
    // ========================================

    function navigateTo(id: string): void {
        const paths: Record<string, string> = {
            home: '/home',
            search: '/search',
            library: '/library',
            playlists: '/playlists',
        };

        const path = paths[id];

        if (!path) {
            return;
        }

        activeMenu.value = id;

        profileMenuOpen.value = false;

        logoutError.value = '';

        void router.push(path);
    }

    function openProfile(): void {
        profileMenuOpen.value = false;

        logoutError.value = '';

        void router.push('/profile');
    }

    function openLibrary(): void {
        navigateTo('library');
    }

    // ========================================
    // ВЫХОД ИЗ АККАУНТА
    // ========================================

    async function logout(): Promise<void> {
        if (loggingOut.value) {
            return;
        }

        loggingOut.value = true;

        logoutError.value = '';

        try {
            await auth.logout();

            profileMenuOpen.value = false;

            await router.replace('/login');
        } catch (error) {
            console.error(
                'Ошибка выхода из аккаунта:',
                error,
            );

            logoutError.value =
                'Не удалось выйти. Попробуй ещё раз.';
        } finally {
            loggingOut.value = false;
        }
    }

    // ========================================
    // ОБРАБОТЧИКИ ПРОФИЛЯ
    // ========================================

    function handleDocumentClick(event: MouseEvent): void {
        const target = event.target;

        if (!(target instanceof Element)) {
            return;
        }

        if (!target.closest('.profile-menu')) {
            profileMenuOpen.value = false;
        }
    }

    function handleEscape(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            profileMenuOpen.value = false;
        }
    }

    // ========================================
    // ВОСПРОИЗВЕДЕНИЕ АУДИО
    // ========================================

    async function playAudio(url: string): Promise<void> {
        if (!url) {
            console.warn(
                'Не указана ссылка на аудиофайл.',
            );

            return;
        }

        audio.pause();

        isSeeking.value = false;

        seekPosition.value = 0;

        progress.value = 0;

        audioDuration.value = 0;

        audio.src = url;

        audio.volume = volume.value / 100;

        try {
            await audio.play();
        } catch (error) {
            isPlaying.value = false;

            console.error(
                'Ошибка воспроизведения:',
                error,
            );
        }
    }

    // async function playExternalTrack(
    //     track: ExternalTrack,
    // ): Promise<void> {
    //     const trackId = track.id;
    //
    //     favoriteRequestId++;
    //
    //     liked.value = false;
    //
    //     currentTrack.value = {
    //         id: trackId,
    //         title: track.title,
    //         artist: track.artist || 'Неизвестный исполнитель',
    //         archiveIdentifier: track.id,
    //         cover: 'cover-purple',
    //         symbol: '♫',
    //     };
    //
    //     progress.value = 0;
    //
    //     seekPosition.value = 0;
    //
    //     audioDuration.value = 0;
    //
    //     isSeeking.value = false;
    //
    //     try {
    //         const audioFile = await getTrackAudio(track.id);
    //
    //         if (
    //             String(currentTrack.value?.id) !== String(trackId)
    //         ) {
    //             return;
    //         }
    //
    //         if (!audioFile?.url) {
    //             throw new Error(
    //                 'Сервер не вернул ссылку на аудиофайл.',
    //             );
    //         }
    //
    //         await playAudio(audioFile.url);
    //     } catch (error) {
    //         console.error(
    //             'Ошибка воспроизведения трека Internet Archive:',
    //             error,
    //         );
    //
    //         if (
    //             String(currentTrack.value?.id) === String(trackId)
    //         ) {
    //             isPlaying.value = false;
    //         }
    //     }
    // }

    // ========================================
    // ВОСПРОИЗВЕДЕНИЕ ТРЕКОВ SKYFI
    // ========================================

    async function playTrack(track: ApiTrack): Promise<void> {
        try {
            await player.playTrack(track);
        } catch (error) {
            console.error(
                'Ошибка воспроизведения трека SkyFi:',
                error,
            );
        }
    }

    // ========================================
    // PLAY / PAUSE
    // ========================================

    async function togglePlay(): Promise<void> {
        if (!currentTrack.value) {
            // if (
            //     search.value.trim() &&
            //     externalTracks.value.length > 0
            // ) {
            //     await playExternalTrack(
            //         externalTracks.value[0],
            //     );
            // } else if (tracks.value.length > 0) {
                await playTrack(tracks.value[0]);
            // }

            return;
        }

        if (audio.paused) {
            try {
                await audio.play();
            } catch (error) {
                console.error(
                    'Ошибка продолжения воспроизведения:',
                    error,
                );
            }
        } else {
            audio.pause();
        }
    }

    // ========================================
    // ПЕРЕМОТКА
    // ========================================

    function onSeekInput(event: Event): void {
        const target = event.target;

        if (!(target instanceof HTMLInputElement)) {
            return;
        }

        isSeeking.value = true;

        const value = Number(target.value);

        seekPosition.value = Math.max(
            0,
            Math.min(value, audioDuration.value || 0),
        );

        progress.value = seekPosition.value;
    }

    function seekAudio(): void {
        if (
            !Number.isFinite(audio.duration) ||
            audio.duration <= 0
        ) {
            isSeeking.value = false;

            return;
        }

        const targetTime = Math.max(
            0,
            Math.min(progress.value, audio.duration),
        );

        audio.currentTime = targetTime;

        progress.value = targetTime;

        seekPosition.value = targetTime;

        isSeeking.value = false;
    }

    // ========================================
    // ПРЕДЫДУЩИЙ / СЛЕДУЮЩИЙ ТРЕК
    // ========================================

    async function nextTrack(
        direction: number,
    ): Promise<void> {
        const playlist: (ApiTrack | ExternalTrack)[] =
            search.value.trim()
                ? externalTracks.value
                : tracks.value;

        if (playlist.length === 0) {
            return;
        }

        const currentIndex = playlist.findIndex(
            (track) =>
                String(track.id) ===
                String(currentTrack.value?.id),
        );

        let nextIndex: number;

        if (currentIndex === -1) {
            nextIndex =
                direction > 0
                    ? 0
                    : playlist.length - 1;
        } else {
            nextIndex =
                (
                    currentIndex +
                    direction +
                    playlist.length
                ) % playlist.length;
        }

        const next = playlist[nextIndex];

        if (!next) {
            return;
        }

        // if ('source' in next) {
        //     await playExternalTrack(next as ExternalTrack);
        // } else {
            await playTrack(next as ApiTrack);
        // }
    }

    // ========================================
    // ФОРМАТИРОВАНИЕ ВРЕМЕНИ
    // ========================================

    function formatTime(value: number): string {
        if (!Number.isFinite(value) || value < 0) {
            return '0:00';
        }

        const seconds = Math.floor(value);

        const minutes = Math.floor(seconds / 60);

        const remainingSeconds = seconds % 60;

        return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    // ========================================
    // ИНИЦИАЛИЗАЦИЯ
    // ========================================

    onMounted(() => {
        void loadTracks();

        audio.addEventListener(
            'timeupdate',
            handleTimeUpdate,
        );

        audio.addEventListener(
            'loadedmetadata',
            handleLoadedMetadata,
        );

        audio.addEventListener(
            'durationchange',
            handleDurationChange,
        );

        audio.addEventListener(
            'play',
            handlePlay,
        );

        audio.addEventListener(
            'pause',
            handlePause,
        );

        audio.addEventListener(
            'ended',
            handleEnded,
        );

        audio.addEventListener(
            'error',
            handleAudioError,
        );

        document.addEventListener(
            'click',
            handleDocumentClick,
        );

        document.addEventListener(
            'keydown',
            handleEscape,
        );
    });

    // ========================================
    // ОЧИСТКА
    // ========================================

    onBeforeUnmount(() => {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        searchRequestId++;

        favoriteRequestId++;

        document.removeEventListener(
            'click',
            handleDocumentClick,
        );

        document.removeEventListener(
            'keydown',
            handleEscape,
        );

        audio.removeEventListener(
            'timeupdate',
            handleTimeUpdate,
        );

        audio.removeEventListener(
            'loadedmetadata',
            handleLoadedMetadata,
        );

        audio.removeEventListener(
            'durationchange',
            handleDurationChange,
        );

        audio.removeEventListener(
            'play',
            handlePlay,
        );

        audio.removeEventListener(
            'pause',
            handlePause,
        );

        audio.removeEventListener(
            'ended',
            handleEnded,
        );

        audio.removeEventListener(
            'error',
            handleAudioError,
        );

        audio.pause();

        audio.removeAttribute('src');

        audio.load();
    });

    // ========================================
    // ЭКСПОРТ ДАННЫХ ДЛЯ ШАБЛОНА
    // ========================================

    return {
        // Авторизация
        auth,

        // Плеер и состояние
        currentTrack,
        isPlaying,
        liked,
        favoriteLoading,
        progress,
        audioDuration,
        isSeeking,
        seekPosition,
        volume,

        // Меню
        menu,
        activeMenu,

        // Поиск
        search,
        filteredTracks,

        // Локальные треки
        tracks,
        tracksLoading,
        tracksError,

        // Внешние треки
        externalTracks,
        externalSearchLoading,
        externalSearchError,

        // Профиль
        profileMenuOpen,
        loggingOut,
        logoutError,

        // Поиск и загрузка
        performExternalSearch,
        loadTracks,

        // Избранное
        updateFavoriteState,
        toggleFavorite,

        // Навигация
        navigateTo,
        openProfile,
        openLibrary,
        logout,

        // Аудио
        playAudio,
        // playExternalTrack,
        playTrack,
        togglePlay,
        onSeekInput,
        seekAudio,
        nextTrack,

        // Форматирование
        formatTime,
    };
}