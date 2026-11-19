import { http } from '@/api/http';
import type {
  YandexDeviceStartPayload,
  YandexDeviceStatusPayload,
  YandexDisconnectPayload,
  YandexImportProgressPayload,
  YandexImportSummaryPayload,
} from '@/types';

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

/** Сводка лайкнутого в Яндексе (api.md §16). 422 «Яндекс Музыка не подключена.», если токена нет. */
export function fetchYandexImportSummary() {
  return http.get<YandexImportSummaryPayload>('import/yandex-music/summary');
}

export function startYandexImport() {
  return http.post<YandexImportProgressPayload>('import/yandex-music');
}

/** null — импорт ещё ни разу не запускался. */
export function fetchYandexImportProgress() {
  return http.get<YandexImportProgressPayload | null>('import/yandex-music');
}

export function cancelYandexImport() {
  return http.delete<YandexImportProgressPayload | null>('import/yandex-music');
}
