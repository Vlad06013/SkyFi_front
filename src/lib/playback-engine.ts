import type { AnySnapshot, PlaySource, RepeatMode } from '@/types';

/**
 * Движок переходов плеера (plan-player.md §1–2): чистые функции
 * resolveNext/resolvePrevious по текущему состоянию. Без Pinia и сети —
 * обвязка живёт в сторе. Очередь приоритетнее контекста; repeat=one
 * перебивает очередь только на автопереходе; конец контекста при
 * repeat=off — сигнал fallback в избранное (плеер не остаётся пустым).
 */

export interface EngineContext {
  current: AnySnapshot | null;
  playSource: PlaySource;
  /** previous_play_source — контекст, игравший до входа в очередь. */
  previousSource: PlaySource | null;
  /** previous_play_source_snapshot — трек, игравший до входа в очередь. */
  previous: AnySnapshot | null;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  /** Эффективный shuffle_seed (серверный либо статический фолбэк стора). */
  seed: string;
  /** Снапшоты pending-элементов серверной очереди в порядке следования. */
  queuePending: AnySnapshot[];
  /** Материализованный контекст; для волны это серверное окно целиком. */
  contextItems: AnySnapshot[];
}

export type EngineAction =
  | { action: 'play'; snapshot: AnySnapshot; playbackSource: PlaySource }
  | { action: 'restart' }
  | { action: 'fallback_favorites' }
  | { action: 'noop' };

export type NextReason = 'manual' | 'ended';

/** Порог рестарта текущего трека вместо перехода назад (секунды). */
export const SKIP_RESTART_AFTER = 3;

/** Идентичность снапшота на проводе — пара source_type + source_id (api.md §1.5). */
export function snapshotKey(snapshot: AnySnapshot): string {
  return `${snapshot.source_type}:${snapshot.source_id}`;
}

/** Строковый хэш (cyrb53) для детерминированной перестановки shuffle. */
export function hashString(input: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Порядок контекста с учётом shuffle: hash-сортировка по
 * hash(seed, source_type + source_id). Один seed + один список =
 * одинаковый порядок на всех устройствах; при выключенном shuffle —
 * исходный порядок.
 */
export function orderedContext(items: AnySnapshot[], shuffleEnabled: boolean, seed: string): AnySnapshot[] {
  if (!shuffleEnabled) return items;
  return [...items].sort(
    (a, b) => hashString(`${seed}:${snapshotKey(a)})`) - hashString(`${seed}:${snapshotKey(b)})`),
  );
}

function sameSnapshot(a: AnySnapshot | null, b: AnySnapshot | null): boolean {
  return a != null && b != null && snapshotKey(a) === snapshotKey(b);
}

/**
 * Следующий элемент контекста после current в (перемешанном) порядке.
 * current не найден (протух/убран) — первый элемент. Дальше некуда —
 * null (вызывающий решает: цикл repeat=all или fallback в избранное).
 */
function nextInContext(items: AnySnapshot[], current: AnySnapshot | null): AnySnapshot | null {
  if (!items.length) return null;
  const index = current ? items.findIndex((item) => sameSnapshot(item, current)) : -1;
  if (index < 0) return items[0];
  return items[index + 1] ?? null;
}

function previousInContext(items: AnySnapshot[], current: AnySnapshot | null): AnySnapshot | null {
  if (!items.length) return null;
  const index = current ? items.findIndex((item) => sameSnapshot(item, current)) : -1;
  if (index <= 0) return null;
  return items[index - 1];
}

export function resolveNext(ctx: EngineContext, reason: NextReason): EngineAction {
  // repeat=one удерживает только автопереход; ручной next идёт дальше.
  if (reason === 'ended' && ctx.repeatMode === 'one' && ctx.current) {
    return { action: 'restart' };
  }

  // Очередь приоритетнее контекста; пока она не пуста — заходим в неё.
  const queued = ctx.queuePending[0];
  if (queued) return { action: 'play', snapshot: queued, playbackSource: 'queue' };

  // Очередь кончилась: возврат в сохранённый контекст целиком на фронте —
  // бэк previous_* только хранит, сам ничего не ставит (сверка 2026-11-23).
  if (ctx.playSource === 'queue') {
    if (ctx.previous && ctx.previousSource) {
      return { action: 'play', snapshot: ctx.previous, playbackSource: ctx.previousSource };
    }
    return { action: 'fallback_favorites' };
  }

  // Ничего не играет и играть не из чего — автопереход ничего не запускает.
  if (!ctx.current && !ctx.contextItems.length) return { action: 'noop' };

  // Волна = контекст из серверного окна; repeat=all по окну не циклится —
  // ротация кончилась → общие правила конца контекста.
  const inWave = ctx.playSource === 'wave';
  const items = orderedContext(ctx.contextItems, ctx.shuffleEnabled && !inWave, ctx.seed);
  const next = nextInContext(items, ctx.current);
  if (next) return { action: 'play', snapshot: next, playbackSource: ctx.playSource };
  if (ctx.repeatMode === 'all' && items.length && !inWave) {
    return { action: 'play', snapshot: items[0], playbackSource: ctx.playSource };
  }
  return { action: 'fallback_favorites' };
}

export function resolvePrevious(ctx: EngineContext, positionSeconds: number): EngineAction {
  if (positionSeconds < SKIP_RESTART_AFTER) return { action: 'restart' };

  // Возврат из очереди: до неё играл previous — шагаем в него.
  if (ctx.playSource === 'queue') {
    if (ctx.previous && ctx.previousSource) {
      return { action: 'play', snapshot: ctx.previous, playbackSource: ctx.previousSource };
    }
    return { action: 'restart' };
  }

  const inWave = ctx.playSource === 'wave';
  const items = orderedContext(ctx.contextItems, ctx.shuffleEnabled && !inWave, ctx.seed);
  const previous = previousInContext(items, ctx.current);
  // Дальше назад некуда — рестарт всегда, независимо от repeat.
  if (!previous) return { action: 'restart' };
  return { action: 'play', snapshot: previous, playbackSource: ctx.playSource };
}

/** Симулированный шаг курсора: сыгранный элемент очереди из pending убираем. */
function advancePeek(ctx: EngineContext, snapshot: AnySnapshot, playbackSource: PlaySource): EngineContext {
  return {
    ...ctx,
    current: snapshot,
    playSource: playbackSource,
    queuePending: playbackSource === 'queue' ? ctx.queuePending.slice(1) : ctx.queuePending,
  };
}

/**
 * Соседи виртуального потока для предзагрузки ссылок (frontend.md §9):
 * прогулка тем же движком вперёд и назад по симулированному состоянию.
 * Best-effort: неточность означает лишь лишнюю прогретую ссылку или
 * пропуск одной — на воспроизведение не влияет. Текущий снапшот и дубли
 * не отдаём.
 */
export function peekAdjacent(
  ctx: EngineContext,
  aheadCount: number,
  backCount: number,
): { ahead: AnySnapshot[]; back: AnySnapshot[] } {
  const seen = new Set(ctx.current ? [snapshotKey(ctx.current)] : []);

  const ahead: AnySnapshot[] = [];
  let sim = ctx;
  for (let i = 0; i < aheadCount; i++) {
    const action = resolveNext(sim, 'manual');
    if (action.action !== 'play') break;
    const key = snapshotKey(action.snapshot);
    if (seen.has(key)) break;
    seen.add(key);
    ahead.push(action.snapshot);
    sim = advancePeek(sim, action.snapshot, action.playbackSource);
  }

  const back: AnySnapshot[] = [];
  sim = ctx;
  for (let i = 0; i < backCount; i++) {
    // Позиция за порогом рестарта: целимся в «переход», не в рестарт текущего.
    const action = resolvePrevious(sim, Number.POSITIVE_INFINITY);
    if (action.action !== 'play') break;
    const key = snapshotKey(action.snapshot);
    if (seen.has(key)) break;
    seen.add(key);
    back.push(action.snapshot);
    sim = advancePeek(sim, action.snapshot, action.playbackSource);
  }
  return { ahead, back };
}
