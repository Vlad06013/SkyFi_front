/** Вид обновления: веб-бандл (OTA) или нативная оболочка (APK). */
export type AppUpdateKind = 'bundle' | 'apk';

/** data ответа GET /app-updates/check; null — обновления нет.
 * kind: apk — новая нативная оболочка (клиент открывает url вне
 * WebView, APK качает браузер, ставит системный установщик);
 * bundle — OTA-бандл веб-части (@capgo/capacitor-updater). */
export interface AppUpdatePayload {
  /** Вид оффера: оболочка (APK) или OTA-бандл веб-части. */
  kind: AppUpdateKind;
  /** Версия релиза semver (оболочки или бандла — по kind). */
  version: string;
  /** Подписанная ссылка на скачивание (без токена, живёт 60 мин). */
  url: string;
  /** SHA-256 файла (hex) — бандл сверяет плагин после скачивания. */
  sha256: string;
  size_bytes: number;
  /** Обязательное: бандл блокирует работу до установки; APK — диалог без «Позже». */
  mandatory: boolean;
  notes: string | null;
}