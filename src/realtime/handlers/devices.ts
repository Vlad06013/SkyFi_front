import { useDevicesStore } from '@/stores/devices';
import type {
  PlaybackDeviceChangedPayload,
  PlaybackDeviceConnectedPayload,
  PlaybackDeviceDisconnectedPayload,
} from '@/types/realtime';

/** playback.device.connected (api.md §17): устройство зарегистрировалось/обновилось. */
export function handleDeviceConnected(payload: PlaybackDeviceConnectedPayload) {
  if (!payload?.device) return;
  useDevicesStore().applyConnected(payload.device);
}

/** playback.device.changed (api.md §17): смена активного устройства. */
export function handleDeviceChanged(payload: PlaybackDeviceChangedPayload) {
  if (payload?.device_id == null) return;
  useDevicesStore().applyChanged(payload.device_id);
}

/** playback.device.disconnected (api.md §17): устройство удалено/пропало. */
export function handleDeviceDisconnected(payload: PlaybackDeviceDisconnectedPayload) {
  if (payload?.device_id == null) return;
  useDevicesStore().applyDisconnected(payload.device_id);
}
