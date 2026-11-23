import { http } from '@/api/http';
import type { AnySnapshot } from '@/types';

/**
 * Окно волны целиком (api.md §14): сервер — источник истины ротации.
 * Ответ всегда полное окно в порядке следования, пустым не бывает;
 * изменение окна приходит сокетом `playback.wave.updated`.
 */
export function fetchWaveWindow() {
  return http.get<{ snapshots: AnySnapshot[] }>('wave').then((payload) => payload.snapshots);
}
