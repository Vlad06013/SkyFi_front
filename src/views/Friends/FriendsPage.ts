import {
    defineComponent,
    onMounted,
    reactive,
    ref,
    watch,
} from 'vue';
import {useRouter} from 'vue-router';

import {
    searchOutline,
    personAddOutline,
    checkmarkOutline,
    closeOutline,
    trashOutline,
    chevronForwardOutline,
} from 'ionicons/icons';

import {IonContent, IonIcon, IonPage} from '@ionic/vue';

import './FriendsPage.css';

import AppNavigation from '@/components/AppNavigation.vue';
import ProfileMenu from '@/components/profile/ProfileMenu.vue';
import AudioPlayer from '@/components/player/AudioPlayer.vue';

import {useAuthStore} from '@/stores/auth';
import useFriendsStore from '@/stores/friends';

import type {
    Friendship,
    FriendshipUser,
    UserSearchResult,
} from '@/types/FriendshipType';

export default defineComponent({
    name: 'FriendsPage',
    components: {
        IonPage,
        IonContent,
        IonIcon,
        AppNavigation,
        ProfileMenu,
        AudioPlayer,
    },
    setup() {
        const router = useRouter();
        const auth = useAuthStore();
        const friendsStore = useFriendsStore();

        const searchQuery = ref('');
        const searchResults = ref<UserSearchResult[]>([]);
        const isSearching = ref(false);
        const actionError = ref('');

        const pending = reactive<Record<string, boolean>>({});

        let searchTimeout: ReturnType<typeof setTimeout> | null = null;

        onMounted(() => {
            void friendsStore.ensureInitialized();
        });

        watch(searchQuery, () => {
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }

            searchTimeout = setTimeout(() => {
                void runSearch();
            }, 350);
        });

        async function runSearch(): Promise<void> {
            const query = searchQuery.value.trim();

            if (query.length < 2) {
                searchResults.value = [];
                return;
            }

            isSearching.value = true;

            try {
                searchResults.value = await friendsStore.search(query);
            } catch (error) {
                console.error('[Friends] Поиск не удался:', error);
                searchResults.value = [];
            } finally {
                isSearching.value = false;
            }
        }

        function isPending(key: string): boolean {
            return !!pending[key];
        }

        async function withPending(
            key: string,
            action: () => Promise<void>,
        ): Promise<void> {
            if (pending[key]) {
                return;
            }

            pending[key] = true;
            actionError.value = '';

            try {
                await action();
            } catch (error) {
                console.error('[Friends] Действие не удалось:', error);
                actionError.value = getErrorMessage(error);
            } finally {
                pending[key] = false;
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

        function getInitial(name?: string | null): string {
            return name?.trim().charAt(0).toUpperCase() || 'U';
        }

        /**
         * В записи дружбы два пользователя: возвращаем не себя, а собеседника.
         */
        function counterpart(friendship: Friendship): FriendshipUser {
            return friendship.sender.id === auth.user?.id
                ? friendship.receiver
                : friendship.sender;
        }

        function findIncoming(
            result: UserSearchResult,
        ): Friendship | undefined {
            if (result.friendship_id == null) {
                return undefined;
            }

            return friendsStore.incomingRequests.find(
                (item) => item.id === result.friendship_id,
            );
        }

        function isFriend(result: UserSearchResult): boolean {
            return result.friendship_status === 'ACCEPTED';
        }

        function isIncoming(result: UserSearchResult): boolean {
            return !!findIncoming(result);
        }

        function isOutgoing(result: UserSearchResult): boolean {
            return (
                result.friendship_status === 'PENDING' &&
                !isIncoming(result)
            );
        }

        async function handleAdd(result: UserSearchResult): Promise<void> {
            await withPending(`search-${result.id}`, async () => {
                const friendship = await friendsStore.sendRequest(result.id);

                result.friendship_id = friendship.id;
                result.friendship_status = friendship.status;
            });
        }

        async function handleAcceptFromSearch(
            result: UserSearchResult,
        ): Promise<void> {
            const incoming = findIncoming(result);

            if (!incoming) {
                return;
            }

            await withPending(`search-${result.id}`, async () => {
                await friendsStore.acceptRequest(incoming.id);
                result.friendship_status = 'ACCEPTED';
            });
        }

        async function handleCancelFromSearch(
            result: UserSearchResult,
        ): Promise<void> {
            if (result.friendship_id == null) {
                return;
            }

            await withPending(`search-${result.id}`, async () => {
                await friendsStore.cancelRequest(result.friendship_id!);
                result.friendship_id = null;
                result.friendship_status = null;
            });
        }

        async function handleAccept(friendshipId: number): Promise<void> {
            await withPending(`row-${friendshipId}`, () =>
                friendsStore.acceptRequest(friendshipId),
            );
        }

        async function handleReject(friendshipId: number): Promise<void> {
            await withPending(`row-${friendshipId}`, () =>
                friendsStore.rejectRequest(friendshipId),
            );
        }

        async function handleCancel(friendshipId: number): Promise<void> {
            await withPending(`row-${friendshipId}`, () =>
                friendsStore.cancelRequest(friendshipId),
            );
        }

        async function handleRemove(friendshipId: number): Promise<void> {
            await withPending(`row-${friendshipId}`, () =>
                friendsStore.removeFriend(friendshipId),
            );
        }

        function openFriend(friendship: Friendship): void {
            void router.push({
                path: `/friends/${counterpart(friendship).id}`,
            });
        }

        return {
            searchOutline,
            personAddOutline,
            checkmarkOutline,
            closeOutline,
            trashOutline,
            chevronForwardOutline,

            searchQuery,
            searchResults,
            isSearching,
            actionError,
            friendsStore,

            isPending,
            getInitial,
            counterpart,
            isFriend,
            isIncoming,
            isOutgoing,

            handleAdd,
            handleAcceptFromSearch,
            handleCancelFromSearch,
            handleAccept,
            handleReject,
            handleCancel,
            handleRemove,
            openFriend,
        };
    },
});
