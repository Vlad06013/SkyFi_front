import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@/types';
import { getSession } from '@/lib/session';
import { localizeServerMessage } from '@/lib/error-messages';

export type ApiErrorKind = 'auth' | 'validation' | 'not-found' | 'rate-limit' | 'server' | 'network' | 'offline';

/** Ошибки kind 'offline' молчат: ни тостов, ни реакций — офлайн и так виден баннером. */
export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'offline';
}

export class ApiError extends Error {
  readonly status: number | null;
  readonly kind: ApiErrorKind;
  /** Код axios (ECONNABORTED/ERR_NETWORK/…) — иначе тип сетевого сбоя теряется. */
  readonly code: string | null;
  /** Ошибки полей (422): ключ поля → список сообщений. */
  readonly fields?: Record<string, string[]>;

  constructor(
    status: number | null,
    kind: ApiErrorKind,
    message: string,
    fields?: Record<string, string[]>,
    code: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
    this.fields = fields;
    this.code = code;
  }
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** 401 от запроса с токеном: сброс сессии + редирект (подписка из main.ts). */
export function onUnauthorized(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

/**
 * Офлайн-гейт (optimizations.md «Офлайн-гейт»): пока колбэк true, все
 * запросы режутся до сети с ApiError kind 'offline'. Предикат ставит
 * стор онлайна — циклического импорта http↔stores нет.
 */
let offlineGate: () => boolean = () => false;

export function setOfflineGate(gate: () => boolean): void {
  offlineGate = gate;
}

/**
 * Исходы запросов для стора онлайна: серия сетевых/5xx фейлов при
 * живом сокете = «сокет онлайн, а HTTP бэка умер» → принудительный
 * офлайн; успех возвращает онлайн.
 */
type NetworkOutcomeHandler = (ok: boolean) => void;
let networkOutcomeHandler: NetworkOutcomeHandler = () => undefined;

export function setNetworkOutcomeHandler(handler: NetworkOutcomeHandler): void {
  networkOutcomeHandler = handler;
}

const instance: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 15_000,
});

/** Смена базового адреса, когда устройство село в домашнюю сеть бэка или вышло из неё. */
export function setApiBaseUrl(url: string): void {
  instance.defaults.baseURL = url;
}

instance.interceptors.request.use(async (config) => {
  if (offlineGate()) throw new ApiError(null, 'offline', 'Нет соединения.');
  const stored = await getSession();
  if (stored?.token) {
    config.headers.Authorization = `Bearer ${stored.token}`;
  }
  return config;
});

function toApiError(error: unknown): ApiError {
  if (!axios.isAxiosError(error)) return new ApiError(null, 'network', 'Нет соединения.');

  const status = error.response?.status ?? null;
  const code = typeof error.code === 'string' ? error.code : null;
  const errors = (error.response?.data as Partial<ApiResponse<unknown>> | undefined)?.errors;
  const rawMessage = typeof errors === 'string' && errors.length > 0 ? errors : null;
  const message = rawMessage ? localizeServerMessage(rawMessage) : null;

  if (status === 401) return new ApiError(401, 'auth', message ?? 'Не авторизован.');
  if (status === 422) {
    const rawFields = typeof errors === 'object' && errors !== null ? (errors as Record<string, string[]>) : undefined;
    const fields = rawFields
      ? Object.fromEntries(
          Object.entries(rawFields).map(([key, list]) => [
            key,
            list.map((item) => localizeServerMessage(item)),
          ]),
        )
      : undefined;
    return new ApiError(422, 'validation', message ?? 'Проверьте поля формы.', fields);
  }
  if (status === 429) return new ApiError(429, 'rate-limit', message ?? 'Слишком часто. Подождите немного.');
  if (status === 404 || status === 403) return new ApiError(status, 'not-found', message ?? 'Не найдено.');
  if (typeof status === 'number' && status >= 500) return new ApiError(status, 'server', message ?? 'Сервер недоступен. Попробуйте позже.');
  if (status === null) return new ApiError(null, 'network', 'Нет соединения.', undefined, code);
  return new ApiError(status, 'server', message ?? 'Ошибка запроса.');
}

instance.interceptors.response.use(
  (response) => {
    networkOutcomeHandler(true);
    // POST /audio/file отдаёт байты, не конверт { data }.
    if (response.config.responseType === 'arraybuffer' || response.config.responseType === 'blob') {
      return response.data;
    }
    return response.data?.data;
  },
  (error) => {
    if (axios.isAxiosError(error) && error.code === 'ERR_CANCELED') throw error;
    // Сетевой/5xx фейл считаем для детектора «сокет жив, HTTP умер»;
    // любой HTTP-ответ (даже 4xx) — признак живого HTTP: счётчик сброс.
    const status = axios.isAxiosError(error) ? (error.response?.status ?? null) : null;
    const networkish = status === null || status >= 500;
    networkOutcomeHandler(!networkish);
    // Улетевший в момент разрыва запрос: сетевой фейл при уже
    // офлайн-флаге мапим в тихий 'offline', чтобы не дублировать тосты.
    const apiError =
      networkish && offlineGate() ? new ApiError(null, 'offline', 'Нет соединения.') : toApiError(error);
    // 401 без Authorization в запросе (неверный пароль на входе) —
    // не повод рвать сессию: ошибку разбирает форма.
    if (apiError.status === 401 && error.config?.headers?.Authorization) {
      unauthorizedHandler?.();
    }
    throw apiError;
  },
);

async function request<T>(promise: Promise<unknown>): Promise<T> {
  return (await promise) as T;
}

export const http = {
  get: <T>(url: string, config?: AxiosRequestConfig): Promise<T> => request<T>(instance.get(url, config) as Promise<unknown>),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => request<T>(instance.post(url, data, config) as Promise<unknown>),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => request<T>(instance.put(url, data, config) as Promise<unknown>),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => request<T>(instance.patch(url, data, config) as Promise<unknown>),
  delete: <T>(url: string, config?: AxiosRequestConfig): Promise<T> => request<T>(instance.delete(url, config) as Promise<unknown>),
  postBytes: (url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ArrayBuffer> =>
    request<ArrayBuffer>(instance.post(url, data, { ...config, responseType: 'arraybuffer' }) as Promise<unknown>),
};
