import { http } from '@/api/http';
import type { DeviceType, EchoFields, PlayerDevice, PlayerStatePayload } from '@/types';

/** data ответа GET /player/devices (api.md §4): объект с ключом, не плоский список. */
interface DevicesPayload {
  devices: PlayerDevice[];
}

/** Presence-список: только онлайн-устройства (api.md §4). */
export function fetchDevices() {
  return http.get<DevicesPayload>('player/devices').then((payload) => payload.devices);
}

/**
 * Регистрация устройства (api.md §4). `origin_device_id` — постоянный uuid
 * устройства; повторная регистрация по тому же uuid обновляет профиль.
 */
export function registerDevice(input: {
  name: string;
  type: DeviceType;
  origin_device_id: string;
  command_id: string;
}) {
  return http.post<PlayerDevice>('player/devices', input);
}

/** Смена активного устройства (api.md §4). `{device}` в пути — device_uuid; эхо — телом. */
export function activateDevice(deviceUuid: string, echo: EchoFields) {
  return http.patch<PlayerStatePayload>(`player/devices/${deviceUuid}/activate`, echo);
}

/** Удаление устройства (api.md §4). `{device}` в пути — device_uuid; эхо-поля — телом. */
export function removeDevice(deviceUuid: string, echo: EchoFields) {
  return http.delete<{ message: string }>(`player/devices/${deviceUuid}`, { data: echo });
}

/**
 * Продление presence (api.md §4). Тело — `{origin_device_id}` с постоянным
 * uuid устройства; неизвестный uuid — 404.
 */
export function sendHeartbeat(deviceUuid: string) {
  return http.post<{ message: string }>('player/devices/heartbeat', { origin_device_id: deviceUuid });
}
