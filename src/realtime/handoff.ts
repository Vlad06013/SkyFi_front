import { Preferences } from '@capacitor/preferences';
import { currentEndpoint } from '@/lib/endpoints';

const HANDOFF_KEY = 'skyfi.realtime';

/**
 * Куда стучаться сокету, если активити уже нет, а сервис «На связи» жив.
 * Читает ConnectionService из CapacitorStorage. Без ключа Reverb не пишем.
 */
export function publishRealtimeHandoff(userId: number): void {
  const endpoint = currentEndpoint();
  const key = import.meta.env.VITE_REVERB_APP_KEY;
  if (!key || !endpoint.reverbHost) return;
  let origin = '';
  try {
    origin = new URL(endpoint.apiUrl).origin;
  } catch {
    return;
  }
  void Preferences.set({
    key: HANDOFF_KEY,
    value: JSON.stringify({
      host: endpoint.reverbHost,
      port: endpoint.reverbPort,
      scheme: endpoint.reverbScheme,
      key,
      origin,
      userId,
    }),
  });
}

export function clearRealtimeHandoff(): void {
  void Preferences.remove({ key: HANDOFF_KEY });
}
