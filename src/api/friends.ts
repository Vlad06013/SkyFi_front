import { http } from '@/api/http';
import type {
  AnySnapshot,
  AuthUser,
  FavoritesPayload,
  FriendNowPlayingPayload,
  FriendshipOverviewPayload,
  FriendshipPayload,
  QueueItem,
  UserSearchItem,
} from '@/types';

export type FriendSection = 'friends' | 'incoming' | 'outgoing';

export interface FriendshipOverviewParams {
  section?: FriendSection;
  q?: string;
}

/** Обзор дружбы секциями одним запросом (api.md §12, GET /friends). */
export function fetchFriendshipOverview(params: FriendshipOverviewParams = {}) {
  return http.get<FriendshipOverviewPayload>('friends', { params });
}

/** Поиск пользователей для заявки + статус заявки (api.md §12). */
export function searchUsers(q: string) {
  return http.get<UserSearchItem[]>('friends/search-users', { params: { q } });
}

/** Отправить заявку (api.md §12). Ответ — дружба целиком. */
export function sendFriendRequest(userId: number) {
  return http.post<FriendshipPayload>('friends/request', { user_id: userId });
}

/** Принять заявку (api.md §12). */
export function acceptFriendship(friendshipId: number) {
  return http.post<FriendshipPayload>(`friends/requests/${friendshipId}/accept`);
}

/** Отклонить заявку / удалить дружбу (api.md §12). */
export function deleteFriendship(friendshipId: number) {
  return http.delete<unknown>(`friends/${friendshipId}`);
}

/** Профиль друга (api.md §12). Предположение: форма AuthUser
 * (id/name/email/avatar_url) — в contracts.md не зафиксирована. */
export function fetchFriendProfile(userId: number) {
  return http.get<AuthUser>(`friends/${userId}`);
}

/** Now-playing друга (api.md §12). */
export function fetchFriendNowPlaying(userId: number) {
  return http.get<FriendNowPlayingPayload>(`friends/${userId}/now-playing`);
}

/** Вкладки избранного друга (api.md §12) — та же форма, что у своего избранного. */
export function fetchFriendFavorites(userId: number) {
  return http.get<FavoritesPayload>(`friends/${userId}/favorites`);
}

/** Очередь друга, ожидающие элементы (api.md §12) — форма QueueItem[]. */
export function fetchFriendQueue(userId: number) {
  return http.get<QueueItem[]>(`friends/${userId}/queue`);
}

/** Перестановка очереди друга (api.md §12). */
export function reorderFriendQueue(userId: number, items: number[]) {
  return http.patch<QueueItem[]>(`friends/${userId}/queue/reorder`, { items });
}

/** Добавить снапшот в очередь друга (api.md §12). Ответ не используем. */
export function addToFriendQueue(userId: number, snapshot: AnySnapshot) {
  return http.post<unknown>(`friends/${userId}/queue`, snapshot);
}

/** Шара другу (api.md §12). Ответ не используем. */
export function shareWithFriend(userId: number, snapshot: AnySnapshot) {
  return http.post<unknown>(`friends/${userId}/share`, snapshot);
}
