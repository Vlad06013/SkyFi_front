import { ref } from 'vue';
import { Preferences } from '@capacitor/preferences';

/**
 * Журнал сетевых событий (онлайн-детект на сокете, см.
 * optimizations.md): коннекты/разрывы ws, переходы онлайн-стейта.
 * На телефоне консоль WebView недоступна — журнал показывается на
 * экране «Настройки → Диагностика сети».
 */
export type NetEvent =
  | 'connect'
  | 'disconnect'
  | 'unavailable'
  | 'failed'
  | 'online'
  | 'offline'
  /** Серия сетевых/5xx фейлов при живом сокете — принудительный офлайн. */
  | 'force-offline'
  /** Стартовый зонд живости бэка (один на запуск приложения). */
  | 'probe'
  /** Presence устройства: подписка/отписка device.{uuid}, device.disconnected. */
  | 'presence'
  /** Смена active_device_id в стейте плеера (кто активный — видно по деталям). */
  | 'active-device';

export interface NetLogEntry {
  /** Момент события (Date.now()). */
  at: number;
  event: NetEvent;
  /** Деталь: close-код/ошибка транспорта, счётчик фейлов. */
  detail: string;
  /** Чем занято приложение в момент события (плеер, скачивания). */
  activity: string;
  /** Перевод онлайн-стейта этим событием. */
  transition: 'online' | 'offline' | null;
}

const STORAGE_KEY = 'skyfi.net-log';
const MAX_ENTRIES = 100;

export const netLog = ref<NetLogEntry[]>([]);

type ActivityProbe = () => string | null;
const activityProbes = new Map<string, ActivityProbe>();

/** Источник активности (плеер, скачивания): короткая строка для журнала или null. */
export function registerNetActivity(name: string, probe: ActivityProbe): void {
  activityProbes.set(name, probe);
}

export function collectNetActivity(): string {
  const parts: string[] = [];
  for (const probe of activityProbes.values()) {
    try {
      const part = probe();
      if (part) parts.push(part);
    } catch {
      /* проба не должна ронять журнал */
    }
  }
  return parts.join(' · ');
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(netLog.value) }).catch(() => undefined);
  }, 1_000);
}

export function recordNetEvent(event: NetEvent, detail = '', transition: NetLogEntry['transition'] = null): void {
  netLog.value = [...netLog.value.slice(-(MAX_ENTRIES - 1)), { at: Date.now(), event, detail, activity: collectNetActivity(), transition }];
  persist();
}

export function clearNetLog(): void {
  netLog.value = [];
  persist();
}

/** Хвост прошлой сессии: флап мог убить приложение до просмотра журнала. */
void Preferences.get({ key: STORAGE_KEY })
  .then(({ value }) => {
    if (!value || netLog.value.length) return;
    const parsed = JSON.parse(value) as NetLogEntry[];
    if (Array.isArray(parsed)) netLog.value = parsed.slice(-MAX_ENTRIES);
  })
  .catch(() => undefined);

const EVENT_LABELS: Record<NetEvent, string> = {
  connect: 'коннект',
  disconnect: 'разрыв',
  unavailable: 'не достучались',
  failed: 'коннект не удался',
  online: 'онлайн',
  offline: 'офлайн',
  'force-offline': 'офлайн (фейлы запросов)',
  probe: 'стартовый зонд',
  presence: 'presence',
  'active-device': 'активное устройство',
};

export function netEventLabel(event: NetEvent): string {
  return EVENT_LABELS[event];
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

function formatAt(at: number): string {
  const date = new Date(at);
  return `${two(date.getDate())}.${two(date.getMonth() + 1)} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

/** Текст для кнопки «Копировать»: журнал целиком, старые сверху. */
export function formatNetLog(entries: NetLogEntry[]): string {
  return entries
    .map((entry) => {
      const head = [formatAt(entry.at), netEventLabel(entry.event).toUpperCase()];
      if (entry.transition) head.push(entry.transition === 'offline' ? '→ ОФФЛАЙН' : '→ ОНЛАЙН');
      const tail = [entry.detail, entry.activity].filter(Boolean).join(' · ');
      return tail ? `${head.join(' ')} — ${tail}` : head.join(' ');
    })
    .join('\n');
}
