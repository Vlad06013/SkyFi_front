import axios from 'axios';
import { ApiError, http } from '@/api/http';
import type { HealthPayload } from '@/types';

/** Поллеру — с запасом: на нестабильном LTE рукопожатие легко съедает 5–10 с. */
export const HEALTH_TIMEOUT_MS = 15_000;

/** Тип промаха зонда: по нему различаем «бэк встал» и «сеть порвала». */
export type HealthMissKind = 'timeout' | 'network' | 'http' | 'payload' | 'unknown';

export interface HealthProbeResult {
  ok: boolean;
  durationMs: number;
  /** null при ok. */
  miss: HealthMissKind | null;
  /** Деталь для журнала: код axios, HTTP-статус, status из тела. */
  detail: string;
}

function classify(error: unknown): { miss: HealthMissKind; detail: string } {
  // http-слой конвертирует axios-ошибки в ApiError — код смотрим сначала там,
  // иначе таймаут и обрыв сливаются в безликое «Нет соединения.».
  const apiError = error instanceof ApiError ? error : null;
  const axiosError = !apiError && axios.isAxiosError(error) ? error : null;
  const status = apiError?.status ?? axiosError?.response?.status ?? null;
  const code = apiError?.code ?? axiosError?.code ?? null;
  const message = error instanceof Error ? error.message : String(error);
  if (typeof status === 'number') return { miss: 'http', detail: `HTTP ${status}` };
  if (code === 'ECONNABORTED') return { miss: 'timeout', detail: message };
  // Сброс/обрыв соединения на сетевом стеке («Software connection abort» и т.п.).
  if (code === 'ERR_NETWORK') return { miss: 'network', detail: message };
  return { miss: 'unknown', detail: [code, message].filter(Boolean).join(': ') || 'network error' };
}

/**
 * Зонд с диагностикой (bugs-player.md, офлайн-флап): длительность и тип
 * промаха уходят в журнал — на устройстве консоль WebView недоступна,
 * журнал смотрим на экране настроек.
 */
export async function probeHealth(timeoutMs: number = HEALTH_TIMEOUT_MS): Promise<HealthProbeResult> {
  const startedAt = Date.now();
  try {
    const data = await http.get<HealthPayload>('health', { timeout: timeoutMs });
    const durationMs = Date.now() - startedAt;
    if (data.status === 'ok') return { ok: true, durationMs, miss: null, detail: '' };
    return { ok: false, durationMs, miss: 'payload', detail: `status=${String(data.status)}` };
  } catch (error) {
    return { ok: false, durationMs: Date.now() - startedAt, ...classify(error) };
  }
}

/**
 * Офлайн-зонд (api.md §1.4): true только на осмысленный 200.
 * Любой сбой/таймаут молча → false — это детектор, а не
 * пользовательское действие, ApiError наружу не идёт.
 */
export async function checkHealth(timeoutMs: number = HEALTH_TIMEOUT_MS): Promise<boolean> {
  return (await probeHealth(timeoutMs)).ok;
}
