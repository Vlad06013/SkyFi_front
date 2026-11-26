/** Базы нашего API: внешняя и домашняя. Чужие CDN (Яндекс, видео-relay) сюда не входят. */
function apiBases(): URL[] {
  return [import.meta.env.VITE_API_URL, import.meta.env.VITE_API_URL_LOCAL]
    .filter((value): value is string => Boolean(value))
    .map((value) => new URL(value));
}

/**
 * Поток с нашего API (загрузка `GET /uploads/{id}/stream`).
 * Его нельзя отдать `<audio src>` как есть: роут требует Bearer, а элемент
 * заголовок не шлёт и получает 401. Ждёт абсолютную ссылку — относительную
 * сначала прогоняют через resolveUrl; в dev-прокси свой поток приходит
 * с origin'ом dev-сервера — тоже наш.
 */
export function isOwnApiStream(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return apiBases().some((api) => {
    const prefix = api.pathname.replace(/\/$/, '');
    if (!parsed.pathname.startsWith(`${prefix}/`)) return false;
    if (parsed.origin === api.origin) return true;
    return (
      import.meta.env.DEV && typeof window !== 'undefined' && parsed.origin === window.location.origin
    );
  });
}
