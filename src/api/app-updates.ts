import { http } from '@/api/http';
import type { AppUpdatePayload } from '@/types/app-update';

/** Есть ли более новый бандл или оболочка (api.md §19). null — ставить нечего. */
export function fetchAppUpdate(current: string, shell: string) {
  return http.get<AppUpdatePayload | null>('app-updates/check', {
    // apk=1 — умеем принимать офферы оболочки; без него бэк их не отдаёт.
    params: { platform: 'android', current, shell, apk: 1 },
  });
}