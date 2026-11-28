import { notifySocial } from '@/lib/notify';
import { useFriendsStore } from '@/stores/friends';
import { useNotificationsStore } from '@/stores/notifications';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type {
  FriendQueueItemAddedPayload,
  FriendshipEventPayload,
  ShareSentPayload,
} from '@/types/realtime';

/** friendship.request.sent (api.md §17): заявка мне — incoming + тост. */
export function handleFriendshipRequestSent(payload: FriendshipEventPayload) {
  if (!payload?.friendship) return;
  useFriendsStore().applyRequestSent(payload.friendship);
  useToastStore().show(payload.friendship.sender.name, 'заявка в друзья');
  notifySocial(payload.friendship.sender.name, 'заявка в друзья', { to: 'friends' });
}

/** friendship.request.accepted (api.md §17): мою заявку приняли — outgoing → friends + тост. */
export function handleFriendshipRequestAccepted(payload: FriendshipEventPayload) {
  if (!payload?.friendship) return;
  useFriendsStore().applyRequestAccepted(payload.friendship);
  useToastStore().show(payload.friendship.receiver.name, 'принял заявку');
  notifySocial(payload.friendship.receiver.name, 'принял заявку', { to: 'friends' });
}

/** friend.queue.item.added (api.md §17): друг добавил в мою очередь. */
export function handleFriendQueueItemAdded(payload: FriendQueueItemAddedPayload) {
  if (!payload?.item) return;
  const name = payload.added_by?.name ?? 'Друг';
  useToastStore().show(payload.item.title, `${name} добавил в очередь`);
  notifySocial(payload.item.title, `${name} добавил в очередь`, { to: 'queue' });
  void usePlayerStore().refreshQueue();
}

/** share.sent (api.md §17): друг поделился — шара в панель + тост. */
export function handleShareSent(payload: ShareSentPayload) {
  if (!payload?.snapshot) return;
  const senderName = payload.sender?.name ?? 'Друг';
  useNotificationsStore().prependShare({
    id: payload.share_id,
    senderName,
    snapshot: payload.snapshot,
  });
  useToastStore().show(payload.snapshot.title, `${senderName} поделился`);
  notifySocial(payload.snapshot.title, `${senderName} поделился`, {
    to: 'share',
    shareId: payload.share_id,
    snapshot: payload.snapshot,
  });
}
