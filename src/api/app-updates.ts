import { http } from '@/api/http';
import type { AppUpdatePayload } from '@/types/app-update';

/** Есть ли более новый веб-бандл (api.md §19). null — ставить нечего. */
export function fetchAppUpdate(current: string, shell: string) {
  return http.get<AppUpdatePayload | null>('app-updates/check', {
    params: { platform: 'android', current, shell },
  });
}
