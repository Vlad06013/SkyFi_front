import { http } from '@/api/http';
import { BUNDLE_VERSION } from '@/lib/bundle-version';
import type { AppUpdatePayload } from '@/types/app-update';

/** Есть ли более новый бандл или оболочка (api.md §19). null — ставить нечего. */
export function fetchAppUpdate(current: string, shell: string) {
  return http.get<AppUpdatePayload | null>('app-updates/check', {
    // apk=1 — умеем принимать офферы оболочки; без него бэк их не отдаёт.
    params: { platform: 'android', current, shell, apk: 1 },
  });
}

/** Последняя опубликованная оболочка — кнопка «Скачать APK» в браузере.
 *  Оболочки у браузера нет: shell=0.0.0, и бэк отвечает оффером apk,
 *  если опубликован хотя бы один релиз оболочки. */
export async function fetchLatestApk() {
  const update = await fetchAppUpdate(BUNDLE_VERSION, '0.0.0');
  return update?.kind === 'apk' ? update : null;
}
