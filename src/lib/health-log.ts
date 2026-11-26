import { ref } from 'vue';
import { Preferences } from '@capacitor/preferences';
import type { HealthMissKind } from '@/api/health';

/**
 * Журнал офлайн-зондов (bugs-player.md, офлайн-флап). На телефоне консоль
 * WebView недоступна, поэтому каждая проверка поллера пишется сюда и
 * показывается на экране «Настройки → Диагностика сети».
 */
export interface HealthLogEntry {
  /** Старт проверки (Date.now()). */
  at: number;
  ok: boolean;
  durationMs: number;
  /** Тип промаха (ok=false): таймаут / обрыв соединения / не-200 / странное тело. */
  miss: HealthMissKind | null;
  /** Деталь промаха: код axios, HTTP-статус, status из тела. */
  detail: string;
  /** Чем занято приложение в момент проверки (скачивание, воспроизведение). */
  activity: string;
  /** Перевод онлайн-стейта этой проверкой. */
  transition: 'online' | 'offline' | null;
}

const STORAGE_KEY = 'skyfi.health-log';
const MAX_ENTRIES = 100;

export const healthLog = ref<HealthLogEntry[]>([]);

type ActivityProbe = () => string | null;
const activityProbes = new Map<string, ActivityProbe>();

/** Источник активности (плеер, скачивания): короткая строка для журнала или null. */
export function registerHealthActivity(name: string, probe: ActivityProbe): void {
  activityProbes.set(name, probe);
}

export function collectHealthActivity(): string {
  const parts: string[] = [];
  for (const probe of activityProbes.values()) {
    try {
      const part = probe();
      if (part) parts.push(part);
    } catch {
      /* проба не должна ронять зонд */
    }
  }
  return parts.join(' · ');
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(healthLog.value) }).catch(() => undefined);
  }, 1_000);
}

export function recordHealth(entry: HealthLogEntry): void {
  healthLog.value = [...healthLog.value.slice(-(MAX_ENTRIES - 1)), entry];
  persist();
}

export function clearHealthLog(): void {
  healthLog.value = [];
  persist();
}

/** Хвост прошлой сессии: флап мог убить приложение до просмотра журнала. */
void Preferences.get({ key: STORAGE_KEY })
  .then(({ value }) => {
    if (!value || healthLog.value.length) return;
    const parsed = JSON.parse(value) as HealthLogEntry[];
    if (Array.isArray(parsed)) healthLog.value = parsed.slice(-MAX_ENTRIES);
  })
  .catch(() => undefined);

const MISS_LABELS: Record<HealthMissKind, string> = {
  timeout: 'таймаут',
  network: 'обрыв',
  http: 'HTTP-ошибка',
  payload: 'странный ответ',
  unknown: 'сбой',
};

export function healthMissLabel(miss: HealthMissKind | null): string {
  return miss ? MISS_LABELS[miss] : 'ок';
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

function formatAt(at: number): string {
  const date = new Date(at);
  return `${two(date.getDate())}.${two(date.getMonth() + 1)} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

/** Текст для кнопки «Копировать»: журнал целиком, старые сверху. */
export function formatHealthLog(entries: HealthLogEntry[]): string {
  return entries
    .map((entry) => {
      const head = [
        formatAt(entry.at),
        entry.ok ? 'ок' : healthMissLabel(entry.miss).toUpperCase(),
        `${(entry.durationMs / 1000).toFixed(1)}с`,
      ];
      if (entry.transition) head.push(entry.transition === 'offline' ? '→ ОФЛАЙН' : '→ онлайн');
      const tail = [entry.detail, entry.activity].filter(Boolean).join(' · ');
      return tail ? `${head.join(' ')} — ${tail}` : head.join(' ');
    })
    .join('\n');
}
