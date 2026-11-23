import type { FriendshipPayload, PlayerStateView, PlayerDevice } from '@/types/api';
import type { AnySnapshot } from '@/types/snapshots';

/** Payload ивентов сокетов (api.md §17, contracts.md «Сокеты»). */

export interface PlaybackStateUpdatedPayload {
  state: PlayerStateView;
  origin_device_id: string | null;
  command_id: string | null;
}

export interface PlaybackQueueUpdatedPayload {
  item: { title: string; artists: string[] } | null;
  origin_device_id: string | null;
  command_id: string | null;
}

/** playback.wave.updated (api.md §17): окно волны изменилось — клиент делает GET /wave. */
export interface WaveUpdatedPayload {
  origin_device_id: string | null;
  command_id: string | null;
}

export interface FriendQueueItemAddedPayload {
  added_by: { id: number; name: string };
  item: { source_id: string; title: string; artists: string[] };
}

export interface PlaybackDeviceConnectedPayload {
  device: PlayerDevice;
  origin_device_id: string | null;
}

export interface PlaybackDeviceChangedPayload {
  device_uuid: string;
  origin_device_id: string | null;
}

export interface PlaybackDeviceDisconnectedPayload {
  device_uuid: string;
  device_name: string;
  origin_device_id: string | null;
  command_id: string | null;
}

export interface ShareSentPayload {
  share_id: number;
  sender: { id: number; name: string };
  snapshot: AnySnapshot;
}

/** friendship.request.sent/accepted (api.md §17). На проводе дружба
 *  обёрнута в ключ (curl 2026-11-20), api.md рисует её «целиком». */
export interface FriendshipEventPayload {
  friendship: FriendshipPayload;
}
