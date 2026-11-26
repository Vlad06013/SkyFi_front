import { http } from '@/api/http';
import type { HealthPayload } from '@/types';

/** Поллеру — с запасом: на нестабильном LTE рукопожатие легко съедает 5–10 с. */
export const HEALTH_TIMEOUT_MS = 15_000;

/**
 * Офлайн-зонд (api.md §1.4): true только на осмысленный 200.
 * Любой сбой/таймаут молча → false — это детектор, а не
 * пользовательское действие, ApiError наружу не идёт.
 */
export async function checkHealth(timeoutMs: number = HEALTH_TIMEOUT_MS): Promise<boolean> {
  try {
    const data = await http.get<HealthPayload>('health', { timeout: timeoutMs });
    return data.status === 'ok';
  } catch {
    return false;
  }
}
