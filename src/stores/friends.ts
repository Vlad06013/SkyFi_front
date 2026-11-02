import {computed, ref, watch} from 'vue';
import {defineStore} from 'pinia';
import {toastController} from '@ionic/vue';

import echo from '@/lib/echo';
import {useAuthStore} from '@/stores/auth';

import {
    getFriends,
    getIncomingRequests,
    getOutgoingRequests,
    sendFriendRequest,
    acceptFriendRequest,
    deleteFriendship,
    searchUsers,
    getTrackShares,
    deleteTrackShare,
} from '@/api/friends';

import type {
    Friendship,
    TrackShareItem,
    UserSearchResult,
} from '@/types/FriendshipType';

import type {Track} from '@/types/TrackType';

const useFriendsStore = defineStore('friends', () => {
    const auth = useAuthStore();

    const friends = ref<Friendship[]>([]);
    const incomingRequests = ref<Friendship[]>([]);
    const outgoingRequests = ref<Friendship[]>([]);
    /** Треки, которыми поделились с нами (свежие сверху). */
    const trackShares = ref<TrackShareItem[]>([]);

    const isLoading = ref(false);
    const initialized = ref(false);

    let isSubscribed = false;
    /** Канал Echo, на который оформлена текущая подписка. */
    let subscribedChannelName: string | null = null;

    const incomingCount = computed(
        () => incomingRequests.value.length,
    );

    async function ensureInitialized(): Promise<void> {
        subscribeToFriendshipEvents();

        if (initialized.value || isLoading.value || !auth.user) {
            return;
        }

        await loadAll();
    }

    async function loadAll(): Promise<void> {
        if (!auth.user) return;

        isLoading.value = true;

        try {
            const [friendsList, incoming, outgoing] = await Promise.all([
                getFriends(),
                getIncomingRequests(),
                getOutgoingRequests(),
            ]);

            friends.value = friendsList;
            incomingRequests.value = incoming;
            outgoingRequests.value = outgoing;
            initialized.value = true;
        } catch (error) {
            console.error(
                '[Friends] Не удалось загрузить данные о друзьях:',
                error,
            );
        } finally {
            isLoading.value = false;
        }

        // Шары не блокируют основную загрузку.
        void loadTrackShares();
    }

    async function loadTrackShares(): Promise<void> {
        if (!auth.user) return;

        try {
            trackShares.value = await getTrackShares();
        } catch (error) {
            console.error(
                '[Friends] Не удалось загрузить шары:',
                error,
            );
        }
    }

    async function removeTrackShare(shareId: number): Promise<void> {
        trackShares.value = trackShares.value.filter(
            (share) => share.id !== shareId,
        );

        try {
            await deleteTrackShare(shareId);
        } catch (error) {
            console.error(
                '[Friends] Не удалось убрать шару:',
                error,
            );
        }
    }

    async function sendRequest(userId: number): Promise<Friendship> {
        const friendship = await sendFriendRequest(userId);
        upsertOutgoing(friendship);
        return friendship;
    }

    async function acceptRequest(friendshipId: number): Promise<void> {
        const friendship = await acceptFriendRequest(friendshipId);

        incomingRequests.value = incomingRequests.value.filter(
            (item) => item.id !== friendshipId,
        );

        upsertFriend(friendship);
    }

    async function rejectRequest(friendshipId: number): Promise<void> {
        await deleteFriendship(friendshipId);

        incomingRequests.value = incomingRequests.value.filter(
            (item) => item.id !== friendshipId,
        );
    }

    async function cancelRequest(friendshipId: number): Promise<void> {
        await deleteFriendship(friendshipId);

        outgoingRequests.value = outgoingRequests.value.filter(
            (item) => item.id !== friendshipId,
        );
    }

    async function removeFriend(friendshipId: number): Promise<void> {
        await deleteFriendship(friendshipId);

        friends.value = friends.value.filter(
            (item) => item.id !== friendshipId,
        );
    }

    async function search(query: string): Promise<UserSearchResult[]> {
        const trimmed = query.trim();

        if (trimmed.length < 2) {
            return [];
        }

        return searchUsers(trimmed);
    }

    // ============================================
    // СОКЕТЫ
    // ============================================

    function unsubscribeFromFriendshipEvents(): void {
        if (subscribedChannelName) {
            echo.leave(subscribedChannelName);
            subscribedChannelName = null;
        }

        isSubscribed = false;
    }

    function subscribeToFriendshipEvents(): void {
        if (!auth.user || isSubscribed) return;

        const channelName = `App.Models.User.${auth.user.id}`;
        subscribedChannelName = channelName;

        echo.private(channelName)
            .listen(
                '.friendship.request.sent',
                (event: { friendship: Friendship }) => {
                    if (!event.friendship) return;

                    upsertIncoming(event.friendship);

                    const senderName =
                        event.friendship.sender?.name ?? 'Пользователь';

                    void showToast(
                        `${senderName} хочет добавить тебя в друзья`,
                    );
                },
            )
            .listen(
                '.friendship.request.accepted',
                (event: { friendship: Friendship }) => {
                    if (!event.friendship) return;

                    outgoingRequests.value = outgoingRequests.value.filter(
                        (item) => item.id !== event.friendship.id,
                    );

                    upsertFriend(event.friendship);

                    const receiverName =
                        event.friendship.receiver?.name ?? 'Пользователь';

                    void showToast(
                        `${receiverName} принял(а) твою заявку в друзья`,
                    );
                },
            )
            .listen(
                '.friend.queue.track.added',
                (event: {
                    added_by?: { id: number; name: string };
                    track?: { title: string; artists?: string[] };
                }) => {
                    if (!event.track) return;

                    const who = event.added_by?.name ?? 'Друг';
                    const artists = event.track.artists?.length
                        ? `${event.track.artists.join(', ')} — `
                        : '';

                    void showToast(
                        `${who} добавил трек в очередь: ${artists}${event.track.title}`,
                    );
                },
            )
            .listen(
                '.track.shared',
                (event: {
                    share_id: number;
                    sender?: { id: number; name: string };
                    track?: Track;
                }) => {
                    if (!event.track) return;

                    const senderName = event.sender?.name ?? 'Друг';
                    const artists =
                        event.track.meta?.artists
                            ?.map((artist) => artist.name)
                            .join(', ');

                    void showToast(
                        `${senderName} поделился треком: ${artists ? `${artists} — ` : ''}${event.track.title}`,
                    );

                    // Шара сразу появляется в списке «поделились со мной».
                    trackShares.value = [
                        {
                            id: Number(event.share_id),
                            sender: event.sender ?? {
                                id: 0,
                                name: senderName,
                            },
                            track: event.track,
                            created_at: new Date().toISOString(),
                        },
                        ...trackShares.value,
                    ];
                },
            );

        isSubscribed = true;
    }

    // При смене пользователя пересобираем подписку на его канал,
    // иначе события останутся привязанными к прежнему аккаунту.
    watch(
        () => auth.user?.id ?? null,
        (userId, previousUserId) => {
            if (userId === previousUserId) return;

            unsubscribeFromFriendshipEvents();

            initialized.value = false;
            friends.value = [];
            incomingRequests.value = [];
            outgoingRequests.value = [];

            if (userId) {
                void ensureInitialized();
            }
        },
    );

    async function showToast(message: string): Promise<void> {
        const toast = await toastController.create({
            message,
            duration: 4000,
            position: 'top',
            cssClass: 'friends-toast',
        });

        await toast.present();
    }

    // ============================================
    // ХЕЛПЕРЫ
    // ============================================

    function upsertIncoming(friendship: Friendship): void {
        if (incomingRequests.value.some((item) => item.id === friendship.id)) {
            return;
        }

        incomingRequests.value = [friendship, ...incomingRequests.value];
    }

    function upsertOutgoing(friendship: Friendship): void {
        if (outgoingRequests.value.some((item) => item.id === friendship.id)) {
            return;
        }

        outgoingRequests.value = [friendship, ...outgoingRequests.value];
    }

    function upsertFriend(friendship: Friendship): void {
        if (friends.value.some((item) => item.id === friendship.id)) {
            return;
        }

        friends.value = [friendship, ...friends.value];
    }

    return {
        friends,
        incomingRequests,
        outgoingRequests,
        trackShares,
        isLoading,
        incomingCount,

        ensureInitialized,
        loadAll,
        loadTrackShares,
        removeTrackShare,
        sendRequest,
        acceptRequest,
        rejectRequest,
        cancelRequest,
        removeFriend,
        search,
    };
});

export default useFriendsStore;
