import {
    defineComponent,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
} from 'vue';
import {useRoute, useRouter} from 'vue-router';

import {
    arrowBackOutline,
    playOutline,
    pauseOutline,
    addOutline,
    checkmarkOutline,
    closeOutline,
    searchOutline,
    chevronUpOutline,
    chevronDownOutline,
    musicalNotesOutline,
} from 'ionicons/icons';

import {IonContent, IonIcon, IonPage, toastController} from '@ionic/vue';

import './FriendPage.css';

import echo from '@/lib/echo';
import AppNavigation from '@/components/AppNavigation.vue';
import ProfileMenu from '@/components/profile/ProfileMenu.vue';

import usePlayerStore from '@/stores/player';

import {
    getFriendProfile,
    getFriendNowPlaying,
    getFriendFavorites,
    getFriendQueue,
    addTrackToFriendQueue,
    reorderFriendQueue,
} from '@/api/friends';

import {searchTracks} from '@/api/search';

import type {FriendProfile} from '@/types/FriendshipType';
import type {PlaybackQueueItem} from '@/types/QueueType';
import type {PlaybackState} from '@/types/PlayerType';
import type {Track} from '@/types/TrackType';
import {PlaySourceListsEnum} from '@/types/PlaySourceListsEnum';

/**
 * Источник воспроизведения для треков со страницы друга:
 * бэкенд по 'search' сам создаёт meta для внешних треков.
 */
const PLAYBACK_SOURCE = PlaySourceListsEnum.SEARCH;

export default defineComponent({
    name: 'FriendPage',
    components: {
        IonPage,
        IonContent,
        IonIcon,
        AppNavigation,
        ProfileMenu,
    },
    setup() {
        const route = useRoute();
        const router = useRouter();
        const player = usePlayerStore();

        const friendId = Number(route.params.id);

        /*
         * Канал дружбы: сюда бэкенд дублирует playback.state.updated
         * и playback.queue.updated, чтобы друзья видели, что он слушает
         * сейчас и какая у него очередь, в реальном времени.
         */
        const friendChannelName = `friends.${friendId}`;

        const profile = ref<FriendProfile | null>(null);
        const nowPlaying = ref<{
            is_playing: boolean;
            track: Track | null;
        } | null>(null);
        const favorites = ref<Track[]>([]);
        const friendQueue = ref<PlaybackQueueItem[]>([]);

        const isLoadingProfile = ref(false);
        const isLoadingNowPlaying = ref(false);
        const isLoadingFavorites = ref(false);
        const isLoadingFriendQueue = ref(false);

        const profileError = ref('');
        const nowPlayingError = ref('');
        const favoritesError = ref('');
        const friendQueueError = ref('');

        onMounted(() => {
            void loadProfile();
            void loadNowPlaying();
            void loadFavorites();
            void loadFriendQueue();

            subscribeToFriendPlayer();
        });

        onBeforeUnmount(() => {
            echo.leave(friendChannelName);
        });

        /**
         * Смена трека/состояния/очереди у друга.
         *
         * В пейлоаде playback.state.updated едет полное состояние
         * (current_track, is_playing, queue) — применяем его напрямую,
         * без запросов now-playing: активное устройство друга шлёт
         * позицию каждые ~10 секунд, и на каждый такой бродкаст
         * дёргать API — страница бы заметно мигала.
         */
        function subscribeToFriendPlayer(): void {
            echo.private(friendChannelName)
                .listen('.playback.state.updated', (event: {state: PlaybackState}) => {
                    applyFriendState(event.state);
                })
                .listen('.playback.queue.updated', () => {
                    void loadFriendQueue();
                });
        }

        /**
         * Применить состояние плеера друга из сокета.
         * Объекты пересоздаём только при реальном изменении,
         * чтобы Vue не перерисовывала блок без нужды.
         */
        function applyFriendState(state: PlaybackState): void {
            const track = state.current_track ?? null;
            const isPlayingNow = !!state.is_playing;
            const previous = nowPlaying.value;

            if (
                !previous ||
                (previous.track?.id ?? null) !== (track?.id ?? null) ||
                previous.is_playing !== isPlayingNow
            ) {
                nowPlaying.value = {
                    is_playing: isPlayingNow,
                    track,
                };
            }

            if (state.queue) {
                const pending = state.queue
                    .filter((item) => item.status === 'pending')
                    .sort((a, b) => a.position - b.position);

                const previousIds = friendQueue.value
                    .map((item) => item.id)
                    .join(',');
                const nextIds = pending.map((item) => item.id).join(',');

                if (previousIds !== nextIds) {
                    friendQueue.value = pending;
                }
            }
        }

        async function loadProfile(): Promise<void> {
            isLoadingProfile.value = true;
            profileError.value = '';

            try {
                profile.value = await getFriendProfile(friendId);
            } catch (error) {
                console.error(
                    '[Friend] Не удалось загрузить профиль:',
                    error,
                );
                profileError.value = getErrorMessage(error);
            } finally {
                isLoadingProfile.value = false;
            }
        }

        async function loadNowPlaying(): Promise<void> {
            isLoadingNowPlaying.value = true;
            nowPlayingError.value = '';

            try {
                nowPlaying.value = await getFriendNowPlaying(friendId);
            } catch (error) {
                console.error(
                    '[Friend] Не удалось загрузить now-playing:',
                    error,
                );
                nowPlayingError.value = getErrorMessage(error);
            } finally {
                isLoadingNowPlaying.value = false;
            }
        }

        async function loadFavorites(): Promise<void> {
            isLoadingFavorites.value = true;
            favoritesError.value = '';

            try {
                favorites.value = await getFriendFavorites(friendId);
            } catch (error) {
                console.error(
                    '[Friend] Не удалось загрузить избранное:',
                    error,
                );
                favoritesError.value = getErrorMessage(error);
            } finally {
                isLoadingFavorites.value = false;
            }
        }

        async function loadFriendQueue(): Promise<void> {
            isLoadingFriendQueue.value = true;
            friendQueueError.value = '';

            try {
                friendQueue.value = await getFriendQueue(friendId);
            } catch (error) {
                console.error(
                    '[Friend] Не удалось загрузить очередь друга:',
                    error,
                );
                friendQueueError.value = getErrorMessage(error);
            } finally {
                isLoadingFriendQueue.value = false;
            }
        }

        function getErrorMessage(error: unknown): string {
            const data = (
                error as {
                    response?: {
                        data?: {
                            errors?: Record<string, string[]>;
                            message?: string;
                        };
                    };
                }
            )?.response?.data;

            if (data?.errors) {
                const first = Object.values(data.errors)
                    .flat()
                    .find(
                        (value): value is string =>
                            typeof value === 'string',
                    );

                if (first) {
                    return first;
                }
            }

            return data?.message ?? 'Произошла ошибка. Попробуй ещё раз.';
        }

        function goBack(): void {
            void router.push('/friends');
        }

        function getInitial(name?: string | null): string {
            return name?.trim().charAt(0).toUpperCase() || 'U';
        }

        function trackArtists(track: Track): string {
            return (
                track.meta?.artists
                    ?.map((artist) => artist.name)
                    .join(', ') ?? ''
            );
        }

        function trackCover(track: Track): string | null {
            return track.meta?.album?.cover_path ?? null;
        }

        function formatDuration(ms: number | null): string {
            if (!ms || ms <= 0) {
                return '';
            }

            const totalSeconds = Math.floor(ms / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;

            return `${minutes}:${String(seconds).padStart(2, '0')}`;
        }

        // ============================================
        // ВОСПРОИЗВЕДЕНИЕ У СЕБЯ
        // ============================================

        function isCurrentTrack(track: Track): boolean {
            const current = player.currentTrack;

            return (
                !!current &&
                String(current.id) === String(track.id)
            );
        }

        /**
         * Клик по треку из поиска: первый — играть у себя,
         * повторный по текущему — пауза.
         */
        async function handleTrackClick(track: Track): Promise<void> {
            if (player.isLoading) {
                return;
            }

            if (isCurrentTrack(track)) {
                await player.togglePlay(PLAYBACK_SOURCE);
                return;
            }

            player.setQueue(queueResults.value, PLAYBACK_SOURCE);

            await player.playTrack(track, PLAYBACK_SOURCE);
        }

        /**
         * Клик по «Слушает сейчас» — играть этот трек у себя.
         */
        async function handleNowPlayingClick(): Promise<void> {
            const track = nowPlaying.value?.track;

            if (!track || player.isLoading) {
                return;
            }

            if (isCurrentTrack(track)) {
                await player.togglePlay(PLAYBACK_SOURCE);
                return;
            }

            await player.playTrack(track, PLAYBACK_SOURCE);
        }

        // ============================================
        // ОЧЕРЕДЬ ДРУГА
        // ============================================

        const isReorderPending = ref(false);

        /**
         * Сдвинуть трек в очереди друга на одну позицию вверх/вниз.
         */
        async function handleMove(item: PlaybackQueueItem, direction: -1 | 1): Promise<void> {
            if (isReorderPending.value) {
                return;
            }

            const ids = friendQueue.value.map((queueItem) => queueItem.id);
            const index = ids.indexOf(item.id);
            const targetIndex = index + direction;

            if (index === -1 || targetIndex < 0 || targetIndex >= ids.length) {
                return;
            }

            [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];

            isReorderPending.value = true;
            friendQueueError.value = '';

            try {
                friendQueue.value = await reorderFriendQueue(friendId, ids);
            } catch (error) {
                console.error(
                    '[Friend] Не удалось изменить порядок очереди:',
                    error,
                );
                friendQueueError.value = getErrorMessage(error);
                await loadFriendQueue();
            } finally {
                isReorderPending.value = false;
            }
        }

        // ============================================
        // ПОИСК + ДОБАВЛЕНИЕ В ОЧЕРЕДЬ
        // ============================================

        const isQueueAddOpen = ref(false);
        const queueSearchInput = ref<HTMLInputElement | null>(null);
        const queueQuery = ref('');
        const queueResults = ref<Track[]>([]);
        const isQueueSearching = ref(false);
        const queueError = ref('');
        const queuePending = ref<Record<string, boolean>>({});

        let queueSearchTimeout: ReturnType<typeof setTimeout> | null = null;

        watch(queueQuery, () => {
            if (queueSearchTimeout) {
                clearTimeout(queueSearchTimeout);
            }

            queueSearchTimeout = setTimeout(() => {
                void runQueueSearch();
            }, 350);
        });

        async function openQueueAdd(): Promise<void> {
            isQueueAddOpen.value = true;

            await nextTick();

            queueSearchInput.value?.focus();
        }

        function closeQueueAdd(): void {
            isQueueAddOpen.value = false;
            queueQuery.value = '';
            queueResults.value = [];
        }

        /**
         * Трек уже есть в очереди друга (пометка «В очереди» в поиске).
         */
        function isTrackInFriendQueue(track: Track): boolean {
            return friendQueue.value.some(
                (item) => String(item.track_id) === String(track.id),
            );
        }

        async function runQueueSearch(): Promise<void> {
            const query = queueQuery.value.trim();

            if (query.length < 2) {
                queueResults.value = [];
                return;
            }

            isQueueSearching.value = true;

            try {
                const response = await searchTracks(query, 15);

                // API возвращает треки массивом в data.
                queueResults.value =
                    (response.data as unknown as Track[]) ?? [];
            } catch (error) {
                console.error(
                    '[Friend] Поиск треков не удался:',
                    error,
                );
                queueResults.value = [];
            } finally {
                isQueueSearching.value = false;
            }
        }

        async function handleAddToQueue(track: Track): Promise<void> {
            const key = String(track.id);

            if (queuePending.value[key]) {
                return;
            }

            queuePending.value[key] = true;
            queueError.value = '';

            try {
                await addTrackToFriendQueue(friendId, track);

                await showToast(`«${track.title}» добавлен в очередь`);

                await loadFriendQueue();
            } catch (error) {
                console.error(
                    '[Friend] Не удалось добавить трек в очередь:',
                    error,
                );
                queueError.value = getErrorMessage(error);
            } finally {
                queuePending.value[key] = false;
            }
        }

        async function showToast(message: string): Promise<void> {
            const toast = await toastController.create({
                message,
                duration: 4000,
                position: 'top',
                cssClass: 'friends-toast',
            });

            await toast.present();
        }

        return {
            arrowBackOutline,
            playOutline,
            pauseOutline,
            addOutline,
            checkmarkOutline,
            closeOutline,
            searchOutline,
            chevronUpOutline,
            chevronDownOutline,
            musicalNotesOutline,

            profile,
            nowPlaying,
            favorites,
            friendQueue,

            player,

            isLoadingProfile,
            isLoadingNowPlaying,
            isLoadingFavorites,
            isLoadingFriendQueue,
            isReorderPending,

            profileError,
            nowPlayingError,
            favoritesError,
            friendQueueError,

            isQueueAddOpen,
            queueSearchInput,
            queueQuery,
            queueResults,
            isQueueSearching,
            queueError,
            queuePending,

            goBack,
            getInitial,
            trackArtists,
            trackCover,
            formatDuration,
            isCurrentTrack,
            handleTrackClick,
            handleNowPlayingClick,
            handleMove,
            openQueueAdd,
            closeQueueAdd,
            isTrackInFriendQueue,
            handleAddToQueue,
        };
    },
});
