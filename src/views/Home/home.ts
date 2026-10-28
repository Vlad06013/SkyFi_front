import { useRouter } from 'vue-router';
import usePlayerStore from '@/stores/player';
import { useAuthStore } from '@/stores/auth';


import {type Track as ApiTrack} from '@/types/TrackType';
// import {getTracks} from '@/api/player';


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
    id: number | string;
    title: string;
    artist: string;
    cover?: string;
    symbol?: string;
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
    // СОСТОЯНИЕ СТРАНИЦЫ
    // ========================================

    const search = ref('');

    const tracks = ref<ApiTrack[]>([]);

    const tracksLoading = ref(false);

    const tracksError = ref('');

    const liked = computed(() => player.liked);

    const favoriteLoading = computed(
        () => player.favoriteLoading,
    );

    // ========================================
    // ПРОФИЛЬ
    // ========================================

    const profileMenuOpen = ref(false);

    const loggingOut = ref(false);

    const logoutError = ref('');

    // ========================================
    // СОСТОЯНИЕ ПЛЕЕРА
    // ========================================

    /*
     * Все состояние воспроизведения хранится
     * в player store.
     *
     * Home не создаёт отдельный экземпляр Audio
     * и не дублирует очередь воспроизведения.
     */

    const currentTrack = computed<PlayerTrack | null>(() => {
        const track = player.currentTrack;

        if (!track) {
            return null;
        }

        return {
            id: track.id,
            title: track.title,
            artist: track.artist,
            cover: track.cover,
            symbol: track.symbol ?? '♫',
        };
    });

    const isPlaying = computed(() => {
        return player.isPlaying;
    });

    const isLoading = computed(() => {
        return player.isLoading;
    });

    const progress = computed(() => {
        return player.progress;
    });

    const audioDuration = computed(() => {
        return player.audioDuration;
    });

    const volume = computed({
        get: () => player.volume,

        set: (value: number) => {
            player.volume = Math.max(
                0,
                Math.min(100, value),
            );
        },
    });

    const progressPercent = computed(() => {
        return player.progressPercent;
    });

    // ========================================
    // ПОИСК ПО КАТАЛОГУ SKYFI
    // ========================================

    function getTrackArtist(track: ApiTrack): string {
        if (!track.artists || track.artists.length === 0) {
            return 'Неизвестный исполнитель';
        }

        return (
            track.artists
                .map((artist) => artist.name)
                .filter(Boolean)
                .join(', ') || 'Неизвестный исполнитель'
        );
    }

    const filteredTracks = computed(() => {
        const query = search.value
            .trim()
            .toLocaleLowerCase();

        if (!query) {
            return tracks.value;
        }

        return tracks.value.filter((track) => {
            const title = track.title
                ?.toLocaleLowerCase() ?? '';

            const artists = getTrackArtist(track)
                .toLocaleLowerCase();

            return (
                title.includes(query) ||
                artists.includes(query)
            );
        });
    });

    watch(search, (value) => {
        activeMenu.value = value.trim()
            ? 'search'
            : 'home';
    });

    // ========================================
    // ЗАГРУЗКА ТРЕКОВ
    // ========================================

    // async function loadTracks(): Promise<void> {
    //     tracksLoading.value = true;
    //     tracksError.value = '';
    //
    //     try {
    //         const response = await getTracks();
    //
    //         tracks.value = response.data ?? [];
    //
    //         // Передаём весь каталог в глобальный плеер.
    //         player.setQueue(tracks.value);
    //
    //     } catch (error) {
    //         console.error('[Home] Ошибка загрузки треков:', error);
    //
    //         tracksError.value = 'Не удалось загрузить треки';
    //         tracks.value = [];
    //     } finally {
    //         tracksLoading.value = false;
    //     }
    // }


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
    // ВОСПРОИЗВЕДЕНИЕ
    // ========================================

    async function playTrack(track: ApiTrack): Promise<void> {
        try {
            await player.playTrack(track);
        } catch (error) {
            console.error(
                'Ошибка воспроизведения трека:',
                error,
            );
        }
    }

    // ========================================
    // PLAY / PAUSE
    // ========================================

    async function togglePlay(): Promise<void> {
        try {
            if (!player.currentTrack) {
                const firstTrack = filteredTracks.value[0];

                if (!firstTrack) {
                    return;
                }

                /*
                 * playTrack устанавливает текущий трек
                 * и запускает воспроизведение.
                 */

                await playTrack(firstTrack);

                return;
            }

            await player.togglePlay();
        } catch (error) {
            console.error(
                'Ошибка переключения воспроизведения:',
                error,
            );
        }
    }

    // ========================================
    // ПРЕДЫДУЩИЙ / СЛЕДУЮЩИЙ ТРЕК
    // ========================================

    async function nextTrack(
        direction: number,
    ): Promise<void> {
        try {
            if (direction > 0) {
                await player.playNext();
            } else if (direction < 0) {
                await player.playPrevious();
            }
        } catch (error) {
            console.error(
                'Ошибка переключения трека:',
                error,
            );
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

        const value = Number(target.value);

        if (!Number.isFinite(value)) {
            return;
        }

        player.progress = Math.max(
            0,
            Math.min(value, player.audioDuration || 0),
        );
    }

    function seekAudio(): void {
        player.seekAudio(player.progress);
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
        // void loadTracks();

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

        document.removeEventListener(
            'click',
            handleDocumentClick,
        );

        document.removeEventListener(
            'keydown',
            handleEscape,
        );

        /*
         * Не останавливаем глобальный плеер:
         * музыка должна продолжать играть при переходах
         * между страницами приложения.
         */
    });

    // ========================================
    // ЭКСПОРТ ДЛЯ ШАБЛОНА
    // ========================================

    return {
        // Авторизация
        auth,

        // Плеер
        currentTrack,
        isPlaying,
        isLoading,
        liked,
        favoriteLoading,
        progress,
        audioDuration,
        volume,
        progressPercent,

        // Меню
        menu,
        activeMenu,

        // Поиск
        search,
        filteredTracks,

        // Каталог
        tracks,
        tracksLoading,
        tracksError,

        // Профиль
        profileMenuOpen,
        loggingOut,
        logoutError,

        // Загрузка
        // loadTracks,

        // Избранное
        updateFavoriteState: player.updateFavoriteState,
        toggleFavorite: player.toggleFavorite,

        // Навигация
        navigateTo,
        openProfile,
        openLibrary,
        logout,

        // Управление плеером
        playTrack,
        togglePlay,
        nextTrack,
        onSeekInput,
        seekAudio,

        // Форматирование
        formatTime,
    };
}
