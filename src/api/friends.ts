import {http} from '@/api/http';
import type {ApiResponse} from '@/types/TypeApiRespone';
import type {Track} from '@/types/TrackType';
import type {
    FriendNowPlaying,
    FriendProfile,
    Friendship,
    UserSearchResult,
} from '@/types/FriendshipType';

/**
 * Список друзей (принятые заявки).
 */
export async function getFriends(): Promise<Friendship[]> {
    const response = await http.get<ApiResponse<Friendship[]>>('/friends');
    return response.data.data;
}

/**
 * Входящие заявки в друзья.
 */
export async function getIncomingRequests(): Promise<Friendship[]> {
    const response = await http.get<ApiResponse<Friendship[]>>(
        '/friends/requests/incoming',
    );
    return response.data.data;
}

/**
 * Исходящие заявки в друзья.
 */
export async function getOutgoingRequests(): Promise<Friendship[]> {
    const response = await http.get<ApiResponse<Friendship[]>>(
        '/friends/requests/outgoing',
    );
    return response.data.data;
}

/**
 * Отправить заявку в друзья по id пользователя.
 */
export async function sendFriendRequest(userId: number): Promise<Friendship> {
    const response = await http.post<ApiResponse<Friendship>>(
        '/friends/request',
        {user_id: userId},
    );
    return response.data.data;
}

/**
 * Принять входящую заявку.
 */
export async function acceptFriendRequest(friendshipId: number): Promise<Friendship> {
    const response = await http.post<ApiResponse<Friendship>>(
        `/friends/requests/${friendshipId}/accept`,
    );
    return response.data.data;
}

/**
 * Удалить связь дружбы: отклонить входящую, отменить исходящую,
 * удалить из друзей — всё это DELETE /friends/{friendship}.
 */
export async function deleteFriendship(friendshipId: number): Promise<void> {
    await http.delete(`/friends/${friendshipId}`);
}

/**
 * Поиск пользователей по имени или email.
 */
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
    const response = await http.get<ApiResponse<UserSearchResult[]>>(
        '/friends/search-users',
        {params: {q: query}},
    );
    return response.data.data;
}

/**
 * Карточка друга (имя, email, статус дружбы).
 */
export async function getFriendProfile(userId: number): Promise<FriendProfile> {
    const response = await http.get<ApiResponse<FriendProfile>>(
        `/friends/${userId}`,
    );
    return response.data.data;
}

/**
 * Что друг слушает сейчас.
 */
export async function getFriendNowPlaying(userId: number): Promise<FriendNowPlaying> {
    const response = await http.get<ApiResponse<FriendNowPlaying>>(
        `/friends/${userId}/now-playing`,
    );
    return response.data.data;
}

/**
 * Избранные треки друга (тот же формат, что и собственные /favorites).
 */
export async function getFriendFavorites(userId: number): Promise<Track[]> {
    const response = await http.get<ApiResponse<Track[]>>(
        `/friends/${userId}/favorites`,
    );
    return response.data.data;
}

/**
 * Добавить трек в очередь воспроизведения друга.
 * Трек может быть внешним — отправляем все его meta-данные.
 */
export async function addTrackToFriendQueue(
    userId: number,
    track: Track,
): Promise<{ message: string }> {
    const response = await http.post<ApiResponse<{ message: string }>>(
        `/friends/${userId}/queue`,
        track,
    );
    return response.data.data;
}
