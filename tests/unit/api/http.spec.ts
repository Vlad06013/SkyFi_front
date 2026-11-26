import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, http, onUnauthorized } from '@/api/http';

const mocks = vi.hoisted(() => {
  const requestUse = vi.fn();
  const responseUse = vi.fn();
  return {
    requestUse,
    responseUse,
    instance: {
      interceptors: {
        request: { use: requestUse },
        response: { use: responseUse },
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

vi.mock('axios', () => ({
  default: {
    create: () => mocks.instance,
    isAxiosError: (error: unknown) => (error as { isAxiosError?: boolean } | null)?.isAxiosError === true,
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

import { getSession } from '@/lib/session';

const getSessionMock = vi.mocked(getSession);

// Перехватчики снимаем один раз: setup-файл чистит mock.calls между тестами.
const requestInterceptor = mocks.requestUse.mock.calls[0][0] as (config: {
  headers: Record<string, string>;
}) => Promise<{ headers: Record<string, string> }>;
const successHandler = mocks.responseUse.mock.calls[0][0] as (response: unknown) => unknown;
const errorHandler = mocks.responseUse.mock.calls[0][1] as (error: unknown) => never;

function axiosError(status: number | null, errors: unknown, withAuthHeader = true) {
  return {
    isAxiosError: true,
    response: status === null ? undefined : { status, data: { errors } },
    config: { headers: withAuthHeader ? { Authorization: 'Bearer x' } : {} },
  };
}

function capture(error: unknown): ApiError {
  try {
    errorHandler(error);
  } catch (caught) {
    return caught as ApiError;
  }
  throw new Error('ожидалось, что интерсептор бросит ApiError');
}

describe('api/http', () => {
  beforeEach(() => {
    onUnauthorized(() => {});
  });

  it('подставляет Bearer из сессии в запрос', async () => {
    getSessionMock.mockResolvedValue({ token: 'abc', user: null as never });
    const config = await requestInterceptor({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer abc');
  });

  it('не трогает заголовок без сессии', async () => {
    getSessionMock.mockResolvedValue(null);
    const config = await requestInterceptor({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
  });

  it('распаковывает data из обёртки ответа', async () => {
    const payload = { errors: null, data: { x: 1 }, pagination: null };
    expect(successHandler({ data: payload, config: {} })).toEqual({ x: 1 });
  });

  it('прокидывает вызовы методов на инстанс', async () => {
    mocks.instance.get.mockResolvedValue('payload');
    await expect(http.get<string>('/x')).resolves.toBe('payload');
    expect(mocks.instance.get).toHaveBeenCalledWith('/x', undefined);
  });

  it('маппит 401 в auth', () => {
    const error = capture(axiosError(401, null));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.kind).toBe('auth');
  });

  it('маппит 422 с объектом полей в validation', () => {
    const fields = { email: ['Некорректный email'] };
    const error = capture(axiosError(422, fields));
    expect(error.kind).toBe('validation');
    expect(error.fields).toEqual(fields);
  });

  it('маппит 422 со строкой (неверный код сброса) в validation с сообщением', () => {
    const error = capture(axiosError(422, 'Код восстановления недействителен.'));
    expect(error.kind).toBe('validation');
    expect(error.message).toBe('Код восстановления недействителен.');
    expect(error.fields).toBeUndefined();
  });

  it('маппит 429 в rate-limit', () => {
    expect(capture(axiosError(429, null)).kind).toBe('rate-limit');
  });

  it('маппит 404 со строкой в not-found с сообщением бэка', () => {
    const error = capture(axiosError(404, 'QR-код не найден.'));
    expect(error.kind).toBe('not-found');
    expect(error.message).toBe('QR-код не найден.');
  });

  it('маппит 5xx в server', () => {
    expect(capture(axiosError(503, null)).kind).toBe('server');
  });

  it('маппит отсутствие ответа в network', () => {
    expect(capture(axiosError(null, null)).kind).toBe('network');
  });

  it('зовёт onUnauthorized на 401 авторизованного запроса', () => {
    const onUnauthorizedMock = vi.fn();
    onUnauthorized(onUnauthorizedMock);
    capture(axiosError(401, 'Не авторизован.', true));
    expect(onUnauthorizedMock).toHaveBeenCalledTimes(1);
  });

  it('не зовёт onUnauthorized на 401 без заголовка (неверный пароль)', () => {
    const onUnauthorizedMock = vi.fn();
    onUnauthorized(onUnauthorizedMock);
    capture(axiosError(401, 'Не авторизован.', false));
    expect(onUnauthorizedMock).not.toHaveBeenCalled();
  });

  it('не-axios ошибка маппится в network', () => {
    expect(capture(new Error('boom')).kind).toBe('network');
  });
});
