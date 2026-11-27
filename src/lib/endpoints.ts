import { ref } from 'vue';
import { setApiBaseUrl } from '@/api/http';

/** Куда смотрит приложение: домашняя сеть бэка или его внешний адрес. */
export type EndpointKind = 'local' | 'wan';

export const endpointKind = ref<EndpointKind>('wan');

const PUBLIC_IP_URL = 'https://api.ipify.org?format=json';
const PUBLIC_IP_TIMEOUT_MS = 4_000;

export interface EndpointTarget {
  apiUrl: string;
  reverbHost: string;
  reverbPort: number;
  reverbScheme: string;
}

/**
 * Совпадает внешний IP устройства с хостом бэка — мы в его домашней сети.
 * IP нет или локалка не задана — остаёмся на внешнем адресе.
 */
/**
 * `VITE_IS_LOCAL_FORCE=true` — не спрашивать внешний IP, сразу домашняя пара.
 * Ручной override на случай сбоя ipify, только для dev (браузер этой машины):
 * в прод-сборке флаг игнорируется — иначе зашитая в APK «всегда локалка»
 * оставила бы телефон без сети вне домашнего Wi‑Fi.
 */
export function isLocalForce(value: string | undefined): boolean {
  return value === 'true';
}

export function chooseRoute(myPublicIp: string | null, wanHost: string, localAllowed: boolean): EndpointKind {
  if (!localAllowed || !myPublicIp) return 'wan';
  return myPublicIp.trim() === wanHost.trim() ? 'local' : 'wan';
}

/**
 * Принудительная локалка не смотрит на IP. Без домашнего адреса в .env
 * остаётся внешняя пара. IP не узнали — оставляем текущую пару.
 */
export function selectEndpoint(input: {
  force: boolean;
  hasLocal: boolean;
  allowed: boolean;
  ip: string | null;
  wanHost: string;
  current: EndpointKind;
}): EndpointKind {
  if (input.force) return input.hasLocal ? 'local' : 'wan';
  if (!input.allowed) return 'wan';
  if (!input.ip) return input.current;
  return chooseRoute(input.ip, input.wanHost, true);
}

function wanHost(): string {
  return new URL(import.meta.env.VITE_API_URL).hostname;
}

function localConfigUrl(): URL | null {
  const raw = import.meta.env.VITE_API_URL_LOCAL;
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function localForced(): boolean {
  return import.meta.env.DEV && isLocalForce(import.meta.env.VITE_IS_LOCAL_FORCE);
}

function localAllowed(): boolean {
  const url = localConfigUrl();
  if (!url) return false;
  // https-страница не имеет права на http-бэк напрямую: смешанный контент.
  // В dev это не запрет — запросы уходят на сам dev-сервер, vite проксирует
  // их на выбранную пару (proxyActive). APK открыт по http — ему можно и так.
  if (url.protocol === 'http:' && typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return import.meta.env.DEV;
  }
  return true;
}

/**
 * Dev на https-странице не может ходить на http-бэк напрямую (mixed content):
 * axios и медиа идут на origin dev-сервера, vite проксирует их дальше.
 */
function proxyActive(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  if (window.location.protocol !== 'https:') return false;
  try {
    return new URL(currentEndpoint().apiUrl).protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * База axios: в прокси-режиме — путь на самом dev-сервере
 * (vite.config проксирует /api), иначе полный адрес выбранной пары.
 */
function browserBase(apiUrl: string): string {
  if (!proxyActive()) return apiUrl;
  try {
    const url = new URL(apiUrl);
    return url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  } catch {
    return apiUrl;
  }
}

/**
 * Origin, по которому доступны ресурсы бэка (обложки, потоки, аватары):
 * хост:порт выбранной пары, а в прокси-режиме — origin dev-сервера.
 * Читает endpointKind — резолвер в шаблонах пересчитается при смене сети.
 */
export function activeOrigin(): string {
  if (proxyActive()) return window.location.origin;
  return new URL(currentEndpoint().apiUrl).origin;
}

/**
 * Ссылки на ресурсы бэка приходят относительными путями (api.md §1.7) —
 * хост подставляем в точке использования, результат не храним: устройство
 * может уйти из домашней сети, и сохранённый хост протухнет. Внешние
 * http(s)-ссылки и blob: проходят без изменений.
 */
export function resolveUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  return activeOrigin() + url;
}

export function currentEndpoint(): EndpointTarget {
  if (endpointKind.value === 'local' && localAllowed()) return localEndpoint();
  return wanEndpoint();
}

function wanEndpoint(): EndpointTarget {
  const api = new URL(import.meta.env.VITE_API_URL);
  return {
    apiUrl: import.meta.env.VITE_API_URL,
    reverbHost: import.meta.env.VITE_REVERB_HOST || api.hostname,
    reverbPort: Number(import.meta.env.VITE_REVERB_PORT || api.port || (api.protocol === 'https:' ? 443 : 80)),
    reverbScheme: import.meta.env.VITE_REVERB_SCHEME || api.protocol.replace(':', ''),
  };
}

function localEndpoint(): EndpointTarget {
  const api = new URL(import.meta.env.VITE_API_URL_LOCAL as string);
  return {
    apiUrl: import.meta.env.VITE_API_URL_LOCAL as string,
    reverbHost: import.meta.env.VITE_REVERB_HOST_LOCAL || api.hostname,
    reverbPort: Number(import.meta.env.VITE_REVERB_PORT_LOCAL || api.port || (api.protocol === 'https:' ? 443 : 80)),
    reverbScheme: import.meta.env.VITE_REVERB_SCHEME || api.protocol.replace(':', ''),
  };
}

async function fetchPublicIp(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLIC_IP_TIMEOUT_MS);
  try {
    const response = await fetch(PUBLIC_IP_URL, { signal: controller.signal });
    if (!response.ok) return null;
    const body = (await response.json()) as { ip?: unknown };
    return typeof body.ip === 'string' && body.ip.length > 0 ? body.ip : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let announced = false;

function applyEndpoint(next: EndpointKind): boolean {
  const changed = next !== endpointKind.value;
  endpointKind.value = next;
  const target = currentEndpoint();
  setApiBaseUrl(browserBase(target.apiUrl));
  if (changed || !announced) {
    console.info(
      `[net] ${next === 'local' ? 'домашняя сеть' : 'внешний адрес'} → ${target.apiUrl} (сокет ${target.reverbHost}:${target.reverbPort})`,
    );
  }
  announced = true;
  return changed;
}

let startupPromise: Promise<boolean> | null = null;

/**
 * Стартовый выбор пары — один на всех. Гвард роутера и main.ts ждут его
 * до первого запроса: без этого монтирование стартовой страницы обгоняло
 * ipify, и запросы улетали на WAN-адрес (в dev через прокси не попадали,
 * https-страница резала их как mixed content).
 */
export function endpointReady(): Promise<boolean> {
  startupPromise ??= resolveEndpoint();
  return startupPromise;
}

/**
 * Выбирает пару адресов и ставит её в HTTP-клиент.
 * true — пара сменилась, сокет надо поднять заново.
 * Внешний IP не узнали — оставляем текущую пару (на старте это внешний адрес).
 */
export async function resolveEndpoint(): Promise<boolean> {
  const force = localForced();
  const hasLocal = localConfigUrl() !== null;
  if (force) return applyEndpoint(selectEndpoint({
    force,
    hasLocal,
    allowed: false,
    ip: null,
    wanHost: wanHost(),
    current: endpointKind.value,
  }));
  if (!localAllowed()) return applyEndpoint('wan');
  const ip = await fetchPublicIp();
  return applyEndpoint(selectEndpoint({
    force: false,
    hasLocal,
    allowed: true,
    ip,
    wanHost: wanHost(),
    current: endpointKind.value,
  }));
}
