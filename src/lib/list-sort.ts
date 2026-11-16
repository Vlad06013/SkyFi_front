import { trackPointer } from '@/lib/pointer-drag';

export type ListSortState = {
  from: number;
  to: number;
  offset: number;
  height: number;
};

let suppressClick = false;

export function consumeSortClick() {
  if (!suppressClick) return false;
  suppressClick = false;
  return true;
}

export function startListSort(
  event: PointerEvent,
  index: number,
  options: {
    container: HTMLElement;
    rowSelector?: string;
    onMove: (state: ListSortState) => void;
    onEnd: (from: number, to: number) => void;
  },
) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const rows = Array.from(options.container.querySelectorAll(options.rowSelector ?? '.track-row')) as HTMLElement[];
  if (rows.length < 2) return;
  const startTops = rows.map((row) => row.getBoundingClientRect().top);
  const height = rows[index]?.getBoundingClientRect().height ?? 52;
  const startY = event.clientY;
  let dropTo = index;
  suppressClick = true;
  options.onMove({ from: index, to: index, offset: 0, height });
  trackPointer(event, {
    move: (next) => {
      const raw = next.clientY - startY;
      const min = startTops[0] - startTops[index];
      const max = startTops[startTops.length - 1] - startTops[index];
      const offset = Math.min(max, Math.max(min, raw));
      const pointerY = startTops[index] + offset + height / 2;
      let to = 0;
      let best = Infinity;
      for (let i = 0; i < startTops.length; i++) {
        const distance = Math.abs(pointerY - (startTops[i] + height / 2));
        if (distance < best) {
          best = distance;
          to = i;
        }
      }
      dropTo = to;
      options.onMove({ from: index, to, offset, height });
    },
    up: () => {
      options.onEnd(index, dropTo);
    },
  });
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list;
  const next = list.slice();
  if (from < 0 || to < 0 || from >= next.length || to >= next.length) return list;
  const [item] = next.splice(from, 1);
  if (!item) return list;
  next.splice(to, 0, item);
  return next;
}

export function sortRowStyle(index: number, drag: ListSortState | null) {
  if (!drag) return undefined;
  const { from, to, offset, height } = drag;
  if (index === from) {
    return {
      transform: `translateY(${offset}px) scale(1.02)`,
      zIndex: 3,
      position: 'relative' as const,
    };
  }
  let shift = 0;
  if (from < to && index > from && index <= to) shift = -height;
  if (from > to && index >= to && index < from) shift = height;
  if (!shift) return undefined;
  return { transform: `translateY(${shift}px)` };
}
