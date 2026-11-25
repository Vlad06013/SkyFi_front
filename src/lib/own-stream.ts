import { currentEndpoint } from '@/lib/endpoints';

/** Базы нашего API: внешняя и домашняя. Чужие CDN (Яндекс, видео-relay) сюда не входят. */
function apiBases(): string[] {
  return [import.meta.env.VITE_API_URL, import.meta.env.VITE_API_URL_LOCAL].filter(
    (value): value is string => Boolean(value),
  );
}

/**
 * Поток с нашего API (загрузка `GET /uploads/{id}/stream`).
 * Его нельзя отдать `<audio src>` как есть: роут требует Bearer, а элемент
 * заголовок не шлёт и получает 401.
 */
export function isOwnApiStream(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return apiBases().some((base) => {
    const api = new URL(base);
    const prefix = api.pathname.replace(/\/$/, '');
    return parsed.origin === api.origin && parsed.pathname.startsWith(`${prefix}/`);
  });
}

/**
 * Хост в ссылке — тот, на который пришёл get-url. Если с тех пор сеть
 * сменилась, подставляем адрес, по которому API сейчас доступен.
 */
export function alignOwnStreamUrl(url: string): string {
  if (!isOwnApiStream(url)) return url;
  const current = new URL(currentEndpoint().apiUrl);
  const parsed = new URL(url);
  parsed.protocol = current.protocol;
  parsed.host = current.host;
  return parsed.toString();
}
