/** data ответа GET /app-updates/check; null — обновления нет
 *  (клиент актуален или оболочка старше shell_min_version). */
export interface AppUpdatePayload {
  /** Версия бандла semver. */
  version: string;
  /** Подписанная ссылка на ZIP (без токена, живёт 60 мин). */
  url: string;
  /** SHA-256 архива (hex) — сверяет плагин после скачивания. */
  sha256: string;
  size_bytes: number;
  /** Обязательное: клиент блокирует работу до установки. */
  mandatory: boolean;
  notes: string | null;
}
