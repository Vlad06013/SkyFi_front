import { describe, expect, it } from 'vitest';
import { aheadRanges, bufferAheadSeconds } from '@/lib/buffer-ranges';

function timeRanges(ranges: Array<[number, number]>): TimeRanges {
  return {
    length: ranges.length,
    start: (index: number) => ranges[index][0],
    end: (index: number) => ranges[index][1],
  } as TimeRanges;
}

describe('lib/buffer-ranges: aheadRanges', () => {
  it('сыгранное позади плейхеда не рисуется', () => {
    const ranges = aheadRanges(timeRanges([[0, 100]]), 40, 200);
    expect(ranges).toEqual([{ start: 0.2, end: 0.5 }]);
  });

  it('диапазон целиком позади — пропускается', () => {
    const ranges = aheadRanges(
      timeRanges([
        [0, 30],
        [40, 90],
      ]),
      40,
      100,
    );
    expect(ranges).toEqual([{ start: 0.4, end: 0.9 }]);
  });

  it('без длительности — пусто', () => {
    expect(aheadRanges(timeRanges([[0, 10]]), 0, 0)).toEqual([]);
  });
});

describe('lib/buffer-ranges: bufferAheadSeconds', () => {
  it('запас — конец накрывающего диапазона минус позиция', () => {
    expect(bufferAheadSeconds(timeRanges([[0, 42]]), 12)).toBe(30);
  });

  it('плейхед в дыре — честный ноль', () => {
    expect(
      bufferAheadSeconds(
        timeRanges([
          [0, 10],
          [20, 40],
        ]),
        15,
      ),
    ).toBe(0);
  });

  it('волосок до края диапазона — стык фрагментов, не дыра', () => {
    expect(bufferAheadSeconds(timeRanges([[10.2, 30]]), 10)).toBeCloseTo(20, 5);
  });

  it('после конца буфера — ноль', () => {
    expect(bufferAheadSeconds(timeRanges([[0, 10]]), 10)).toBe(0);
  });
});
