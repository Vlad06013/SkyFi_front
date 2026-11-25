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
export function chooseRoute(myPublicIp: string | null, wanHost: string, localAllowed: boolean): EndpointKind {
  if (!localAllowed || !myPublicIp) return 'wan';
  return myPublicIp.trim() === wanHost.trim() ? 'local' : 'wan';
}

function wanHost(): string {
  return new URL(import.meta.env.VITE_API_URL).hostname;
}

function localAllowed(): boolean {
  const raw = import.meta.env.VITE_API_URL_LOCAL;
  if (!raw) return false;
  try {
    const url = new URL(raw);
    // https-страница не имеет права на http-бэк: смешанный контент.
    // APK открыт по http, ему локальный адрес доступен.
    if (url.protocol === 'http:' && typeof window !== 'undefined' && window.location.protocol === 'https:') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
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
  setApiBaseUrl(target.apiUrl);
  if (changed || !announced) {
    console.info(
      `[net] ${next === 'local' ? 'домашняя сеть' : 'внешний адрес'} → ${target.apiUrl} (сокет ${target.reverbHost}:${target.reverbPort})`,
    );
  }
  announced = true;
  return changed;
}

/**
 * Выбирает пару адресов и ставит её в HTTP-клиент.
 * true — пара сменилась, сокет надо поднять заново.
 * Внешний IP не узнали — оставляем текущую пару (на старте это внешний адрес).
 */
export async function resolveEndpoint(): Promise<boolean> {
  if (!localAllowed()) return applyEndpoint('wan');
  const ip = await fetchPublicIp();
  if (!ip) return applyEndpoint(endpointKind.value);
  return applyEndpoint(chooseRoute(ip, wanHost(), true));
}
