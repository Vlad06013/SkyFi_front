import {
    computed,
    onMounted,
    ref,
} from 'vue';

import axios from 'axios';

import {
    getPlaylists,
    getPlaylist,
    createPlaylist as createPlaylistApi,
    deletePlaylist as deletePlaylistApi,
    removeTrackFromPlaylist,
    invalidatePlaylistsCache,
    type Playlist,
    type PlaylistWithTracks,
} from '@/api/playlists';

import type { Track } from '@/api/tracks';

import usePlayerStore from '@/stores/player';

// ============================================
// ТИПЫ
// ============================================

type PlaylistTab = 'all' | 'recent';

// ============================================
// ЛОГИКА ПЛЕЙЛИСТОВ
// ============================================

export function usePlaylists() {
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
    // ВКЛАДКИ
    // ============================================

    const tabs: {
        label: string;
        value: PlaylistTab;
    }[] = [
        { label: 'Все плейлисты', value: 'all' },
        { label: 'Недавние', value: 'recent' },
    ];

    const activeTab = ref<PlaylistTab>('all');

    const visiblePlaylists = computed<Playlist[]>(() => {
        const list = [...playlists.value];

        if (activeTab.value === 'recent') {
            // «Недавние» — плейлисты, обновлённые последними.
            return list.sort(
                (a, b) =>
                    new Date(b.updated_at).getTime() -
                    new Date(a.updated_at).getTime(),
            );
        }

        return list;
    });

    // ============================================
    // СПИСОК ПЛЕЙЛИСТОВ
    // ============================================

    const playlists = ref<Playlist[]>([]);
    const loading = ref(false);
    const error = ref('');

    let playlistsRequestId = 0;

    async function loadPlaylists(): Promise<void> {
        const requestId = ++playlistsRequestId;

        loading.value = true;
        error.value = '';

        try {
            const response = await getPlaylists();

            if (requestId !== playlistsRequestId) {
                return;
            }

            const received: unknown = response.data;

            if (!Array.isArray(received)) {
                throw new Error(
                    'Сервер вернул список плейлистов в неизвестном формате.',
                );
            }

            playlists.value = received as Playlist[];
            invalidatePlaylistsCache();
        } catch (err: unknown) {
            if (requestId !== playlistsRequestId) {
                return;
            }

            console.error(
                '[Playlists] Ошибка загрузки плейлистов:',
                err,
            );

            error.value = resolveErrorMessage(
                err,
                'Войди в аккаунт, чтобы просматривать плейлисты.',
                'Не удалось загрузить плейлисты.',
            );
        } finally {
            if (requestId === playlistsRequestId) {
                loading.value = false;
            }
        }
    }

    // ============================================
    // ВЫБРАННЫЙ ПЛЕЙЛИСТ
    // ============================================

    const selectedPlaylist = ref<PlaylistWithTracks | null>(null);
    const detailLoading = ref(false);
    const detailError = ref('');

    let detailRequestId = 0;

    async function openPlaylist(playlist: Playlist): Promise<void> {
        activeTab.value = 'all';

        const requestId = ++detailRequestId;

        detailLoading.value = true;
        detailError.value = '';
        selectedPlaylist.value = null;

        try {
            const response = await getPlaylist(
                Number(playlist.id),
            );

            if (requestId !== detailRequestId) {
                return;
            }

            selectedPlaylist.value = response.data;
        } catch (err: unknown) {
            if (requestId !== detailRequestId) {
                return;
            }

            console.error(
                '[Playlists] Ошибка загрузки плейлиста:',
                err,
            );

            detailError.value = resolveErrorMessage(
                err,
                'Войди в аккаунт, чтобы открывать плейлисты.',
                'Не удалось загрузить плейлист.',
            );
        } finally {
            if (requestId === detailRequestId) {
                detailLoading.value = false;
            }
        }
    }

    function closePlaylist(): void {
        detailRequestId++;
        detailLoading.value = false;
        detailError.value = '';
        selectedPlaylist.value = null;
    }

    async function refreshSelectedPlaylist(): Promise<void> {
        if (!selectedPlaylist.value) {
            return;
        }

        await openPlaylist(selectedPlaylist.value);
    }

    // ============================================
    // СОЗДАНИЕ ПЛЕЙЛИСТА
    // ============================================

    const showCreate = ref(false);
    const newName = ref('');
    const newDescription = ref('');
    const formError = ref('');
    const creating = ref(false);

    function closeCreate(): void {
        showCreate.value = false;
        newName.value = '';
        newDescription.value = '';
        formError.value = '';
    }

    async function createPlaylist(): Promise<void> {
        const name = newName.value.trim();

        if (!name) {
            formError.value = 'Введи название плейлиста.';
            return;
        }

        if (creating.value) {
            return;
        }

        creating.value = true;
        formError.value = '';

        try {
            const response = await createPlaylistApi({
                name,
                description: newDescription.value,
            });

            closeCreate();

            // Обновляем список и сразу открываем новый плейлист.
            await loadPlaylists();
            await openPlaylist(response.data);
        } catch (err: unknown) {
            console.error(
                '[Playlists] Ошибка создания плейлиста:',
                err,
            );

            formError.value = resolveErrorMessage(
                err,
                'Войди в аккаунт, чтобы создавать плейлисты.',
                'Не удалось создать плейлист.',
            );
        } finally {
            creating.value = false;
        }
    }

    // ============================================
    // УДАЛЕНИЕ ПЛЕЙЛИСТА
    // ============================================

    const deleting = ref(false);

    async function deleteSelectedPlaylist(): Promise<void> {
        if (!selectedPlaylist.value || deleting.value) {
            return;
        }

        const name = selectedPlaylist.value.name;

        if (!window.confirm(`Удалить плейлист «${name}»?`)) {
            return;
        }

        deleting.value = true;

        try {
            await deletePlaylistApi(
                Number(selectedPlaylist.value.id),
            );

            closePlaylist();
            await loadPlaylists();
        } catch (err: unknown) {
            console.error(
                '[Playlists] Ошибка удаления плейлиста:',
                err,
            );

            detailError.value = resolveErrorMessage(
                err,
                'Войди в аккаунт, чтобы удалять плейлисты.',
                'Не удалось удалить плейлист.',
            );
        } finally {
            deleting.value = false;
        }
    }

    // ============================================
    // ТРЕКИ ПЛЕЙЛИСТА
    // ============================================

    const removingTrackId = ref<number | null>(null);

    async function removeTrack(trackId: number): Promise<void> {
        if (!selectedPlaylist.value || removingTrackId.value !== null) {
            return;
        }

        const playlistId = Number(selectedPlaylist.value.id);
        const normalizedTrackId = Number(trackId);

        if (
            !Number.isFinite(playlistId) ||
            playlistId <= 0 ||
            !Number.isFinite(normalizedTrackId) ||
            normalizedTrackId <= 0
        ) {
            return;
        }

        removingTrackId.value = normalizedTrackId;

        try {
            await removeTrackFromPlaylist(
                playlistId,
                normalizedTrackId,
            );

            await refreshSelectedPlaylist();
            await loadPlaylists();
        } catch (err: unknown) {
            console.error(
                '[Playlists] Ошибка удаления трека из плейлиста:',
                err,
            );

            detailError.value = resolveErrorMessage(
                err,
                'Войди в аккаунт, чтобы изменять плейлисты.',
                'Не удалось убрать трек из плейлиста.',
            );
        } finally {
            removingTrackId.value = null;
        }
    }

    // ============================================
    // ВОСПРОИЗВЕДЕНИЕ
    // ============================================

    async function playPlaylist(): Promise<void> {
        const playlist = selectedPlaylist.value;

        if (!playlist || !playlist.tracks.length) {
            return;
        }

        try {
            player.setQueue([...playlist.tracks]);

            const firstTrack = playlist.tracks[0];

            await player.playTrack(firstTrack);
        } catch (err: unknown) {
            console.error(
                '[Playlists] Ошибка воспроизведения плейлиста:',
                err,
            );
        }
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

    function getTrackColor(id: number): string {
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
    // ОШИБКИ
    // ============================================

    function resolveErrorMessage(
        err: unknown,
        unauthorizedMessage: string,
        fallbackMessage: string,
    ): string {
        if (axios.isAxiosError(err)) {
            if (err.response?.status === 401) {
                return unauthorizedMessage;
            }

            if (!err.response) {
                return 'Не удалось подключиться к серверу. Проверь интернет-соединение.';
            }

            return (
                err.response.data?.message ||
                fallbackMessage
            );
        }

        return err instanceof Error
            ? err.message
            : fallbackMessage;
    }

    // ============================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================

    onMounted(() => {
        void loadPlaylists();
    });

    // ============================================
    // ПУБЛИЧНЫЙ API
    // ============================================

    return {
        // Вкладки
        tabs,
        activeTab,
        visiblePlaylists,

        // Список
        playlists,
        loading,
        error,
        loadPlaylists,

        // Детали
        selectedPlaylist,
        detailLoading,
        detailError,
        openPlaylist,
        closePlaylist,
        deleteSelectedPlaylist,
        deleting,

        // Создание
        showCreate,
        newName,
        newDescription,
        formError,
        creating,
        createPlaylist,
        closeCreate,

        // Треки
        removeTrack,
        removingTrackId,

        // Плеер
        playerIsPlaying,
        isCurrentTrack,
        playPlaylist,

        // Оформление
        getTrackColor,
        pluralizeTracks,
    };
}
