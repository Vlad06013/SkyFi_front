import { useDevicesStore } from '@/stores/devices';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type {
  PlaybackDeviceChangedPayload,
  PlaybackDeviceConnectedPayload,
  PlaybackDeviceDisconnectedPayload,
} from '@/types/realtime';

/**
 * playback.device.connected (api.md §17): устройство зарегистрировалось/обновилось.
 * Незнакомый uuid — «вход нового устройства»: тост. До сида списка (loaded)
 * не тостим — все устройства выглядели бы новыми при старте приложения.
 */
export function handleDeviceConnected(payload: PlaybackDeviceConnectedPayload) {
  if (!payload?.device) return;
  const devices = useDevicesStore();
  const isNew =
    devices.loaded && !devices.devices.some((item) => item.device_uuid === payload.device.device_uuid);
  devices.applyConnected(payload.device);
  if (isNew) useToastStore().show(payload.device.name, 'новое устройство в сети');
}

/** playback.device.changed (api.md §17): смена активного устройства — патч стейта плеера. */
export function handleDeviceChanged(payload: PlaybackDeviceChangedPayload) {
  if (payload?.device_uuid == null) return;
  usePlayerStore().applyActiveDevice(payload.device_uuid);
}

/** playback.device.disconnected (api.md §17): устройство офлайн (разрыв сокета + грейс) или удалено; было активным — активного больше нет. */
export function handleDeviceDisconnected(payload: PlaybackDeviceDisconnectedPayload) {
  if (payload?.device_uuid == null) return;
  useDevicesStore().applyDisconnected(payload.device_uuid);
  const player = usePlayerStore();
  if (player.state.active_device_id === payload.device_uuid) player.applyActiveDevice(null);
}
