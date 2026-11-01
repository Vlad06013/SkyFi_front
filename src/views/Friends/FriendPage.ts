import {
    defineComponent,
    onBeforeUnmount,
    onMounted,
    reactive,
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
    searchOutline,
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
    addTrackToFriendQueue,
} from '@/api/friends';

import {searchTracks} from '@/api/search';

import type {FriendProfile} from '@/types/FriendshipType';
import type {Track} from '@/types/TrackType';
import {PlaySourceListsEnum} from '@/types/PlaySourceListsEnum';

const NOW_PLAYING_REFRESH_MS = 30000;

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
         * Канал дружбы: сюда бэкенд дублирует playback.state.updated,
         * чтобы друзья видели смену треков в реальном времени.
         */
        const friendChannelName = `friends.${friendId}`;

        const profile = ref<FriendProfile | null>(null);
        const nowPlaying = ref<{
            is_playing: boolean;
            track: Track | null;
        } | null>(null);
        const favorites = ref<Track[]>([]);

        const isLoadingProfile = ref(false);
        const isLoadingNowPlaying = ref(false);
        const isLoadingFavorites = ref(false);

        const profileError = ref('');
        const nowPlayingError = ref('');
        const favoritesError = ref('');

        let nowPlayingTimer: ReturnType<typeof setInterval> | null = null;

        onMounted(() => {
            void loadProfile();
            void loadNowPlaying();
            void loadFavorites();

            subscribeToFriendPlayer();

            nowPlayingTimer = setInterval(() => {
                void loadNowPlaying();
            }, NOW_PLAYING_REFRESH_MS);
        });

        onBeforeUnmount(() => {
            if (nowPlayingTimer) {
                clearInterval(nowPlayingTimer);
            }

            echo.leave(friendChannelName);
        });

        /**
         * Смена трека/состояния у друга — обновляем блок «Слушает сейчас».
         */
        function subscribeToFriendPlayer(): void {
            echo.private(friendChannelName).listen(
                '.playback.state.updated',
                () => {
                    void loadNowPlaying();
                },
            );
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

            player.setQueue(queueResults.value);

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

        const queueQuery = ref('');
        const queueResults = ref<Track[]>([]);
        const isQueueSearching = ref(false);
        const queueError = ref('');
        const queuedTrackIds = reactive<Record<string, boolean>>({});
        const queuePending = reactive<Record<string, boolean>>({});

        let queueSearchTimeout: ReturnType<typeof setTimeout> | null = null;

        watch(queueQuery, () => {
            if (queueSearchTimeout) {
                clearTimeout(queueSearchTimeout);
            }

            queueSearchTimeout = setTimeout(() => {
                void runQueueSearch();
            }, 350);
        });

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

            if (queuePending[key]) {
                return;
            }

            queuePending[key] = true;
            queueError.value = '';

            try {
                await addTrackToFriendQueue(friendId, track);
                queuedTrackIds[key] = true;

                await showToast(`«${track.title}» добавлен в очередь`);
            } catch (error) {
                console.error(
                    '[Friend] Не удалось добавить трек в очередь:',
                    error,
                );
                queueError.value = getErrorMessage(error);
            } finally {
                queuePending[key] = false;
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
            searchOutline,
            musicalNotesOutline,

            profile,
            nowPlaying,
            favorites,

            player,

            isLoadingProfile,
            isLoadingNowPlaying,
            isLoadingFavorites,

            profileError,
            nowPlayingError,
            favoritesError,

            queueQuery,
            queueResults,
            isQueueSearching,
            queueError,
            queuedTrackIds,
            queuePending,

            goBack,
            getInitial,
            trackArtists,
            trackCover,
            formatDuration,
            handleAddToQueue,
            isCurrentTrack,
            handleTrackClick,
            handleNowPlayingClick,
        };
    },
});
