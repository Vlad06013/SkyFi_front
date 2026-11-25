import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@/types';
import { getSession } from '@/lib/session';
import { localizeServerMessage } from '@/lib/error-messages';

export type ApiErrorKind = 'auth' | 'validation' | 'not-found' | 'rate-limit' | 'server' | 'network';

export class ApiError extends Error {
  readonly status: number | null;
  readonly kind: ApiErrorKind;
  /** Ошибки полей (422): ключ поля → список сообщений. */
  readonly fields?: Record<string, string[]>;

  constructor(status: number | null, kind: ApiErrorKind, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
    this.fields = fields;
  }
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** 401 от запроса с токеном: сброс сессии + редирект (подписка из main.ts). */
export function onUnauthorized(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

const instance: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 15_000,
});

instance.interceptors.request.use(async (config) => {
  const stored = await getSession();
  if (stored?.token) {
    config.headers.Authorization = `Bearer ${stored.token}`;
  }
  return config;
});

function toApiError(error: unknown): ApiError {
  if (!axios.isAxiosError(error)) return new ApiError(null, 'network', 'Нет соединения.');

  const status = error.response?.status ?? null;
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
  if (status === null) return new ApiError(null, 'network', 'Нет соединения.');
  return new ApiError(status, 'server', message ?? 'Ошибка запроса.');
}

instance.interceptors.response.use(
  (response) => {
    // POST /audio/file отдаёт байты, не конверт { data }.
    if (response.config.responseType === 'arraybuffer' || response.config.responseType === 'blob') {
      return response.data;
    }
    return response.data?.data;
  },
  (error) => {
    if (axios.isAxiosError(error) && error.code === 'ERR_CANCELED') throw error;
    const apiError = toApiError(error);
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
