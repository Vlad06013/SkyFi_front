import { describe, expect, it } from 'vitest';
import { nearestInDirection, tvRemoteAction, type TvArrow } from '@/lib/tv-remote';

function el(x: number, y: number, className = ''): HTMLElement {
  const node = document.createElement('button');
  if (className) node.className = className;
  node.getBoundingClientRect = () =>
    ({
      x,
      y,
      left: x,
      top: y,
      right: x + 40,
      bottom: y + 40,
      width: 40,
      height: 40,
      toJSON() {
        return {};
      },
    }) as DOMRect;
  return node;
}

function act(key: TvArrow, extra: Partial<Parameters<typeof tvRemoteAction>[0]> = {}) {
  return tvRemoteAction({
    key,
    expanded: false,
    home: true,
    active: null,
    page: [],
    rail: [],
    player: [],
    menu: [],
    ...extra,
  });
}

describe('tv remote', () => {
  it('вверх без элемента выше открывает плеер', () => {
    const play = el(100, 40);
    expect(act('ArrowUp', { active: play, page: [play] })).toEqual({ type: 'open-player' });
    expect(act('ArrowUp')).toEqual({ type: 'open-player' });
  });

  it('вверх с полки поднимает фокус, а не плеер', () => {
    const listen = el(100, 40);
    const card = el(100, 200);
    expect(act('ArrowUp', { active: card, page: [listen, card] })).toEqual({ type: 'focus', el: listen });
  });

  it('вниз при спрятанных кнопках клипа закрывает плеер', () => {
    expect(act('ArrowDown', { expanded: true, player: [] })).toEqual({ type: 'close-player' });
    expect(act('ArrowLeft', { expanded: true, player: [] })).toEqual({ type: 'ignore' });
  });

  it('вниз из-под кнопок плеера закрывает его', () => {
    const back = el(20, 20);
    const play = el(200, 300, 'fab');
    expect(act('ArrowDown', { expanded: true, active: play, player: [back, play] })).toEqual({
      type: 'close-player',
    });
    expect(act('ArrowDown', { expanded: true, active: back, player: [back, play] })).toEqual({
      type: 'focus',
      el: play,
    });
  });

  it('влево с края главной уходит в меню', () => {
    const listen = el(80, 80);
    const tab = el(10, 80, 'on');
    expect(act('ArrowLeft', { active: listen, page: [listen], rail: [tab] })).toEqual({
      type: 'focus',
      el: tab,
    });
  });

  it('влево по карусели сдвигает карточку', () => {
    const first = el(40, 200);
    const second = el(200, 200);
    expect(nearestInDirection(second, [first, second], 'ArrowLeft')).toBe(first);
    expect(act('ArrowLeft', { active: second, page: [first, second], rail: [el(10, 80, 'on')] })).toEqual({
      type: 'focus',
      el: first,
    });
  });
});
