import {computed, ref} from 'vue';
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
} from '@/api/friends';

import type {Friendship, UserSearchResult} from '@/types/FriendshipType';

const useFriendsStore = defineStore('friends', () => {
    const auth = useAuthStore();

    const friends = ref<Friendship[]>([]);
    const incomingRequests = ref<Friendship[]>([]);
    const outgoingRequests = ref<Friendship[]>([]);

    const isLoading = ref(false);
    const initialized = ref(false);

    let isSubscribed = false;

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

    function subscribeToFriendshipEvents(): void {
        if (!auth.user || isSubscribed) return;

        echo.private(`App.Models.User.${auth.user.id}`)
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
            );

        isSubscribed = true;
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
        isLoading,
        incomingCount,

        ensureInitialized,
        loadAll,
        sendRequest,
        acceptRequest,
        rejectRequest,
        cancelRequest,
        removeFriend,
        search,
    };
});

export default useFriendsStore;
