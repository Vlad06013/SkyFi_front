import type { BufferedRange } from '@/components/SeekBar/SeekBar';

/**
 * Честный буфер: MSE держит уже сыгранные диапазоны до вытеснения, и
 * нарисованная целиком серая полоса врала — «буфер есть», а запас впереди
 * ноль, и воспроизведение стопорится на каждом сегменте. Для UI и
 * диагностики считаем только то, что впереди плейхеда.
 */

/** Диапазоны вперёд от плейхеда в долях длительности (0..1) — заливка сикбара. */
export function aheadRanges(buffered: TimeRanges, position: number, duration: number): BufferedRange[] {
  const ranges: BufferedRange[] = [];
  if (duration <= 0) return ranges;
  for (let index = 0; index < buffered.length; index += 1) {
    const start = buffered.start(index);
    const end = buffered.end(index);
    if (end <= position) continue;
    ranges.push({
      start: Math.min(1, Math.max(start, position) / duration),
      end: Math.min(1, end / duration),
    });
  }
  return ranges;
}

/**
 * Запас буфера в секундах: конец диапазона, накрывающего плейхед, минус
 * позиция. Плейхед в дыре (seek, вытеснение) — честный 0.
 */
export function bufferAheadSeconds(buffered: TimeRanges, position: number): number {
  for (let index = 0; index < buffered.length; index += 1) {
    // Небольшой допуск на стык диапазонов: hls.js клеит фрагменты вплотную,
    // но currentTime может стоять на волосок за краем.
    if (buffered.start(index) <= position + 0.25 && position < buffered.end(index)) {
      return Math.max(0, buffered.end(index) - position);
    }
  }
  return 0;
}
