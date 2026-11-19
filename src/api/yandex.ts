import { http } from '@/api/http';
import type { YandexDeviceStartPayload, YandexDeviceStatusPayload, YandexDisconnectPayload } from '@/types';

export function startYandexDeviceAuth() {
  return http.post<YandexDeviceStartPayload>('yandex-music/auth/device/start');
}

/** И поллинг device-сессии, и проверка «подключён ли аккаунт» (api.md §3). */
export function fetchYandexDeviceStatus() {
  return http.get<YandexDeviceStatusPayload>('yandex-music/auth/device/status');
}

export function disconnectYandex() {
  return http.delete<YandexDisconnectPayload>('yandex-music/auth');
}
