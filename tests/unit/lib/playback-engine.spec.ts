import { describe, expect, it } from 'vitest';
import {
  orderedContext,
  peekAdjacent,
  resolveNext,
  resolvePrevious,
  snapshotKey,
  SKIP_RESTART_AFTER,
  type EngineContext,
} from '@/lib/playback-engine';
import type { AnySnapshot, RepeatMode } from '@/types';

function track(title: string, sourceType: AnySnapshot['source_type'] = 'yandex_music'): AnySnapshot {
  return {
    type: 'track',
    source_type: sourceType,
    source_id: `${sourceType}-${title}`,
    title,
    artists: [{ name: 'Artist' }],
    duration_ms: 180_000,
    cover_url: null,
    album: null,
    stream_url: null,
  };
}

function ctx(overrides: Partial<EngineContext> = {}): EngineContext {
  return {
    current: null,
    playSource: 'favorites',
    previousSource: null,
    previous: null,
    repeatMode: 'off',
    shuffleEnabled: false,
    seed: 'seed-1',
    queuePending: [],
    contextItems: [],
    ...overrides,
  };
}

const A = track('A');
const B = track('B');
const C = track('C');
const D = track('D');

describe('resolveNext', () => {
  it('очередь приоритетнее контекста (manual и ended)', () => {
    const context = ctx({ current: A, contextItems: [A, B], queuePending: [C] });
    expect(resolveNext(context, 'manual')).toEqual({ action: 'play', snapshot: C, playbackSource: 'queue' });
    expect(resolveNext(context, 'ended')).toEqual({ action: 'play', snapshot: C, playbackSource: 'queue' });
  });

  it('repeat=one: автопереход удерживает текущий (рестарт), очередь ждёт', () => {
    const context = ctx({ current: A, repeatMode: 'one', queuePending: [C] });
    expect(resolveNext(context, 'ended')).toEqual({ action: 'restart' });
  });

  it('repeat=one: ручной next игнорирует повтор и идёт в очередь', () => {
    const context = ctx({ current: A, repeatMode: 'one', queuePending: [C] });
    expect(resolveNext(context, 'manual')).toEqual({ action: 'play', snapshot: C, playbackSource: 'queue' });
  });

  it('следующий элемент контекста', () => {
    const context = ctx({ current: A, contextItems: [A, B, C] });
    expect(resolveNext(context, 'ended')).toEqual({ action: 'play', snapshot: B, playbackSource: 'favorites' });
  });

  it('конец контекста + repeat=all — цикл на первый', () => {
    const context = ctx({ current: C, contextItems: [A, B, C], repeatMode: 'all' });
    expect(resolveNext(context, 'ended')).toEqual({ action: 'play', snapshot: A, playbackSource: 'favorites' });
  });

  it('конец контекста + repeat=off — fallback в избранное', () => {
    const context = ctx({ current: C, contextItems: [A, B, C], repeatMode: 'off' });
    expect(resolveNext(context, 'ended')).toEqual({ action: 'fallback_favorites' });
  });

  it('snapshot не найден в списке — начинаем с первого', () => {
    const stranger = track('X');
    const context = ctx({ current: stranger, contextItems: [A, B] });
    expect(resolveNext(context, 'manual')).toEqual({ action: 'play', snapshot: A, playbackSource: 'favorites' });
  });

  it('очередь кончилась (source=queue) — возврат в previous_*', () => {
    const context = ctx({
      current: C,
      playSource: 'queue',
      previousSource: 'playlist',
      previous: A,
      contextItems: [A, B],
    });
    expect(resolveNext(context, 'ended')).toEqual({ action: 'play', snapshot: A, playbackSource: 'playlist' });
  });

  it('очередь кончилась, previous нет — fallback в избранное', () => {
    const context = ctx({ current: C, playSource: 'queue' });
    expect(resolveNext(context, 'ended')).toEqual({ action: 'fallback_favorites' });
  });

  it('single: контекст из одного трека — next ведёт в избранное', () => {
    const context = ctx({ current: A, playSource: 'single', contextItems: [A] });
    expect(resolveNext(context, 'manual')).toEqual({ action: 'fallback_favorites' });
  });

  it('волна: repeat=all по окну не циклится — конец ротации', () => {
    const context = ctx({ current: B, playSource: 'wave', contextItems: [A, B], repeatMode: 'all' });
    expect(resolveNext(context, 'ended')).toEqual({ action: 'fallback_favorites' });
  });

  it('пустой контекст без current — noop', () => {
    expect(resolveNext(ctx(), 'ended')).toEqual({ action: 'noop' });
  });
});

describe('resolvePrevious', () => {
  it(`позиция > ${SKIP_RESTART_AFTER} с — рестарт текущего`, () => {
    const context = ctx({ current: B, contextItems: [A, B, C] });
    expect(resolvePrevious(context, 10)).toEqual({ action: 'restart' });
  });

  it('у начала трека — предыдущий элемент контекста', () => {
    const context = ctx({ current: B, contextItems: [A, B, C] });
    expect(resolvePrevious(context, 1)).toEqual({ action: 'play', snapshot: A, playbackSource: 'favorites' });
  });

  it('начало контекста — рестарт всегда, независимо от repeat', () => {
    for (const repeatMode of ['off', 'one', 'all'] as RepeatMode[]) {
      const context = ctx({ current: A, contextItems: [A, B], repeatMode });
      expect(resolvePrevious(context, 30)).toEqual({ action: 'restart' });
    }
  });

  it('из очереди — возврат в previous_*', () => {
    const context = ctx({
      current: C,
      playSource: 'queue',
      previousSource: 'search',
      previous: A,
    });
    expect(resolvePrevious(context, 1)).toEqual({ action: 'play', snapshot: A, playbackSource: 'search' });
  });

  it('из очереди без previous — рестарт', () => {
    const context = ctx({ current: C, playSource: 'queue' });
    expect(resolvePrevious(context, 15)).toEqual({ action: 'restart' });
  });
});

describe('orderedContext (shuffle)', () => {
  const items = [A, B, C, D];

  it('выключен — исходный порядок', () => {
    expect(orderedContext(items, false, 'seed-1')).toEqual(items);
  });

  it('включён — детерминированная перестановка, исходный массив не мутирует', () => {
    const shuffled = orderedContext(items, true, 'seed-1');
    expect(shuffled).toHaveLength(4);
    expect([...shuffled].sort((a, b) => snapshotKey(a).localeCompare(snapshotKey(b)))).toEqual(
      [...items].sort((a, b) => snapshotKey(a).localeCompare(snapshotKey(b))),
    );
    expect(orderedContext(items, true, 'seed-1')).toEqual(shuffled);
    expect(items).toEqual([A, B, C, D]);
  });

  it('другой seed — другой порядок (для списка из 4+ элементов)', () => {
    const a = orderedContext(items, true, 'seed-1').map(snapshotKey);
    const b = orderedContext(items, true, 'seed-2').map(snapshotKey);
    expect(a).not.toEqual(b);
  });

  it('shuffle не дырявит next: следующий после current живёт в перестановке', () => {
    const shuffled = orderedContext(items, true, 'seed-1');
    const index = shuffled.findIndex((item) => snapshotKey(item) === snapshotKey(B));
    const context = ctx({ current: B, contextItems: items, shuffleEnabled: true, seed: 'seed-1' });
    const expected = shuffled[index + 1] ?? null;
    if (expected) {
      expect(resolveNext(context, 'manual')).toEqual({ action: 'play', snapshot: expected, playbackSource: 'favorites' });
    } else {
      expect(resolveNext(context, 'manual')).toEqual({ action: 'fallback_favorites' });
    }
  });
});


describe('playback-engine: peekAdjacent (предзагрузка ссылок)', () => {
  it('вперёд: очередь приоритетнее контекста, ходим по pending подряд', () => {
    const context = ctx({
      current: track('cur'),
      playSource: 'favorites',
      queuePending: [track('q1'), track('q2')],
      contextItems: [track('cur'), track('n1'), track('n2'), track('n3')],
    });

    const { ahead, back } = peekAdjacent(context, 2, 2);

    expect(ahead.map((item) => item.source_id)).toEqual(['yandex_music-q1', 'yandex_music-q2']);
    // current — первый элемент контекста: назад некуда.
    expect(back).toEqual([]);
  });

  it('контекст продолжается после исчерпания очереди (previous — серверный)', () => {
    // Серверное состояние после входа в очередь: previous_* — точка возврата.
    const context = ctx({
      current: track('q1'),
      playSource: 'queue',
      previousSource: 'favorites',
      previous: track('cur'),
      queuePending: [],
      contextItems: [track('cur'), track('n1')],
    });

    const { ahead } = peekAdjacent(context, 2, 0);

    // Возврат к 'cur' (его ссылка уже в кеше — играл до очереди), дальше
    // контекст продолжается обычным ходом.
    expect(ahead.map((item) => item.source_id)).toEqual(['yandex_music-cur', 'yandex_music-n1']);
  });

  it('назад: соседи слева в (перемешанном) порядке контекста', () => {
    const context = ctx({
      current: track('c'),
      playSource: 'favorites',
      contextItems: [track('p2'), track('p1'), track('c'), track('n1')],
    });

    const { ahead, back } = peekAdjacent(context, 2, 2);

    expect(ahead.map((item) => item.source_id)).toEqual(['yandex_music-n1']);
    expect(back.map((item) => item.source_id)).toEqual(['yandex_music-p1', 'yandex_music-p2']);
  });

  it('single без контекста: некуда — пустые списки', () => {
    const context = ctx({ current: track('only'), playSource: 'single', contextItems: [] });

    expect(peekAdjacent(context, 2, 2)).toEqual({ ahead: [], back: [] });
  });

  it('одноэлементный контекст с repeat=all не отдаёт текущий как соседа', () => {
    const context = ctx({
      current: track('only'),
      playSource: 'favorites',
      repeatMode: 'all',
      contextItems: [track('only')],
    });

    expect(peekAdjacent(context, 2, 2)).toEqual({ ahead: [], back: [] });
  });

  it('конец контекста с repeat=off: дальше некуда (fallback — не снапшот)', () => {
    const context = ctx({
      current: track('last'),
      playSource: 'favorites',
      repeatMode: 'off',
      contextItems: [track('last')],
    });

    expect(peekAdjacent(context, 2, 0).ahead).toEqual([]);
  });
});
