import { http } from '@/api/http';
import type { DeviceType, PlayerDevice, PlayerStatePayload } from '@/types';

/** data ответа GET /player/devices (api.md §4): объект с ключом, не плоский список. */
interface DevicesPayload {
  devices: PlayerDevice[];
}

/** Presence-список: только онлайн-устройства (api.md §4). */
export function fetchDevices() {
  return http.get<DevicesPayload>('player/devices').then((payload) => payload.devices);
}

/**
 * Регистрация устройства (api.md §4). `origin_device_id` — локальный uuid
 * устройства (валидация бэка требует строгий UUID); повторная регистрация
 * по тому же uuid обновляет профиль и возвращает тот же серверный `id`.
 */
export function registerDevice(input: {
  name: string;
  type: DeviceType;
  origin_device_id: string;
  command_id: string;
}) {
  return http.post<PlayerDevice>('player/devices', input);
}

/** Смена активного устройства (api.md §4). Эхо-поля — серверный id устройства. */
export function activateDevice(id: number, echo: { origin_device_id: number; command_id: string }) {
  return http.patch<PlayerStatePayload>(`player/devices/${id}/activate`, echo);
}

/** Удаление устройства (api.md §4, query-эхо-поля). */
export function removeDevice(id: number, echo: { origin_device_id: number; command_id: string }) {
  return http.delete<{ message: string }>(`player/devices/${id}`, { params: echo });
}

/**
 * Продление presence (api.md §4). `device_uuid` — локальный uuid
 * устройства (валидация бэка требует строгий UUID).
 */
export function sendHeartbeat(deviceUuid: string) {
  return http.post<{ message: string }>('player/devices/heartbeat', { device_uuid: deviceUuid });
}
