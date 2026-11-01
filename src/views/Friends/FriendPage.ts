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
    addOutline,
    checkmarkOutline,
    searchOutline,
    musicalNotesOutline,
} from 'ionicons/icons';

import {IonContent, IonIcon, IonPage, toastController} from '@ionic/vue';

import './FriendPage.css';

import AppNavigation from '@/components/AppNavigation.vue';
import ProfileMenu from '@/components/profile/ProfileMenu.vue';
import AudioPlayer from '@/components/player/AudioPlayer.vue';

import {
    getFriendProfile,
    getFriendNowPlaying,
    getFriendFavorites,
    addTrackToFriendQueue,
} from '@/api/friends';

import {searchTracks} from '@/api/search';

import type {FriendProfile} from '@/types/FriendshipType';
import type {Track} from '@/types/TrackType';

const NOW_PLAYING_REFRESH_MS = 30000;

export default defineComponent({
    name: 'FriendPage',
    components: {
        IonPage,
        IonContent,
        IonIcon,
        AppNavigation,
        ProfileMenu,
        AudioPlayer,
    },
    setup() {
        const route = useRoute();
        const router = useRouter();

        const friendId = Number(route.params.id);

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

            nowPlayingTimer = setInterval(() => {
                void loadNowPlaying();
            }, NOW_PLAYING_REFRESH_MS);
        });

        onBeforeUnmount(() => {
            if (nowPlayingTimer) {
                clearInterval(nowPlayingTimer);
            }
        });

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
            addOutline,
            checkmarkOutline,
            searchOutline,
            musicalNotesOutline,

            profile,
            nowPlaying,
            favorites,

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
        };
    },
});
