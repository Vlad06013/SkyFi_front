import { afterEach, describe, expect, it, vi } from 'vitest';
import { moveItem, sortRowStyle, startListSort } from '@/lib/list-sort';

const rowHeight = 52;
const rowCount = 4;
const rowTops = Array.from({ length: rowCount }, (_, i) => i * rowHeight);

function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  for (let i = 0; i < rowCount; i++) {
    const row = document.createElement('div');
    row.className = 'track-row';
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      top: rowTops[i] ?? 0,
      height: rowHeight,
    } as DOMRect);
    container.appendChild(row);
  }
  return container;
}

function pointerEvent(type: string, pointerId: number, clientY: number): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  Object.defineProperty(event, 'clientY', { value: clientY });
  return event;
}

/** clientY центра строки index. */
const centerY = (index: number) => (rowTops[index] ?? 0) + rowHeight / 2;

function drag(from: number, to: number) {
  const container = makeContainer();
  const onMove = vi.fn();
  const onEnd = vi.fn();
  const down = {
    pointerType: 'touch',
    button: 0,
    pointerId: 1,
    clientY: centerY(from),
    cancelable: false,
  } as unknown as PointerEvent;

  startListSort(down, from, { container, onMove, onEnd });
  window.dispatchEvent(pointerEvent('pointermove', 1, centerY(to)));
  window.dispatchEvent(pointerEvent('pointerup', 1, centerY(to)));
  return { onMove, onEnd };
}

describe('lib/list-sort', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [0, 0],
    [0, 1],
    [0, 3],
    [1, 3],
    [3, 0],
    [3, 2],
    [2, 0],
  ])('перетаскивание %i → %i даёт onEnd(from=%i, to=%i)', (from, to) => {
    const { onEnd } = drag(from, to);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith(from, to);
  });

  it('onMove сообщает путь от from до to', () => {
    const { onMove } = drag(0, 2);
    const states = onMove.mock.calls.map(([state]) => state);
    expect(states[0]).toMatchObject({ from: 0, to: 0 });
    expect(states.at(-1)).toMatchObject({ from: 0, to: 2 });
  });

  it('moveItem переставляет элемент без мутации исходного списка', () => {
    const list = ['a', 'b', 'c', 'd'];
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(list, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveItem(list, 2, 2)).toEqual(list);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sortRowStyle сдвигает только строки между from и to', () => {
    const dragState = { from: 0, to: 2, offset: 100, height: rowHeight };
    expect(sortRowStyle(0, dragState)?.transform).toContain('translateY(100px)');
    expect(sortRowStyle(1, dragState)?.transform).toContain('translateY(-52px)');
    expect(sortRowStyle(2, dragState)?.transform).toContain('translateY(-52px)');
    expect(sortRowStyle(3, dragState)).toBeUndefined();
  });
});
