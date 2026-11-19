import { http } from '@/api/http';
import type { HealthPayload } from '@/types';

export const HEALTH_TIMEOUT_MS = 5_000;

/**
 * Офлайн-зонд (api.md §1.4): true только на осмысленный 200.
 * Любой сбой/таймаут молча → false — это детектор, а не
 * пользовательское действие, ApiError наружу не идёт.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const data = await http.get<HealthPayload>('health', { timeout: HEALTH_TIMEOUT_MS });
    return data.status === 'ok';
  } catch {
    return false;
  }
}
