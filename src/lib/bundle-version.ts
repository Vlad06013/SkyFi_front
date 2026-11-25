/** Версия веб-бандла. Совпадает с версией, которую публикуют
 *  `php artisan app:release`. Перед сборкой релиза её поднимают здесь. */
export const BUNDLE_VERSION = '1.0.2';

/** `App.getInfo().version` бывает `1.0`. Бэк сравнивает semver `X.Y.Z`. */
export function shellSemver(versionName: string): string {
  const parts = versionName.split('.').map((part) => part.trim()).filter((part) => part.length > 0);
  if (!parts.length) return '0.0.0';
  while (parts.length < 3) parts.push('0');
  return parts.slice(0, 3).join('.');
}
