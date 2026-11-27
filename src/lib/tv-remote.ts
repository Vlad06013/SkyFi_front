/** Пульт телевизора: стрелки двигают фокус, крайние жесты открывают и закрывают плеер. */

export type TvArrow = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export type TvRemoteAction =
  | { type: 'focus'; el: HTMLElement }
  | { type: 'open-player' }
  | { type: 'close-player' }
  | { type: 'ignore' };

export function isTvArrow(key: string): key is TvArrow {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
}

function center(el: HTMLElement) {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** Ближайший элемент в сторону стрелки. Слишком в стороне — не кандидат. */
export function nearestInDirection(from: HTMLElement, candidates: HTMLElement[], dir: TvArrow): HTMLElement | null {
  const origin = center(from);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of candidates) {
    if (el === from) continue;
    const point = center(el);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    if (dir === 'ArrowUp' && dy >= -8) continue;
    if (dir === 'ArrowDown' && dy <= 8) continue;
    if (dir === 'ArrowLeft' && dx >= -8) continue;
    if (dir === 'ArrowRight' && dx <= 8) continue;
    const primary = dir === 'ArrowUp' || dir === 'ArrowDown' ? Math.abs(dy) : Math.abs(dx);
    const secondary = dir === 'ArrowUp' || dir === 'ArrowDown' ? Math.abs(dx) : Math.abs(dy);
    if (secondary > primary * 1.6 + 48) continue;
    const score = primary + secondary * 1.4;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

export function tvRemoteAction(input: {
  key: TvArrow;
  expanded: boolean;
  home: boolean;
  active: HTMLElement | null;
  page: HTMLElement[];
  rail: HTMLElement[];
  player: HTMLElement[];
  menu: HTMLElement[];
}): TvRemoteAction {
  const { key, expanded, home, active, page, rail, player, menu } = input;
  if (menu.length) {
    if (!active) return menu[0] ? { type: 'focus', el: menu[0] } : { type: 'ignore' };
    const next = nearestInDirection(active, menu, key);
    return next ? { type: 'focus', el: next } : { type: 'ignore' };
  }

  const inRail = active != null && rail.includes(active);
  const inPlayer = active != null && player.includes(active);

  if (expanded) {
    if (!player.length) return key === 'ArrowDown' ? { type: 'close-player' } : { type: 'ignore' };
    const pool = player;
    if (key === 'ArrowDown') {
      if (!inPlayer || !active) {
        const play = pool.find((el) => el.classList.contains('fab')) ?? pool[0];
        return play ? { type: 'focus', el: play } : { type: 'close-player' };
      }
      const next = nearestInDirection(active, pool, key);
      return next ? { type: 'focus', el: next } : { type: 'close-player' };
    }
    if (!active || !inPlayer) {
      const play = pool.find((el) => el.classList.contains('fab')) ?? pool[0];
      return play ? { type: 'focus', el: play } : { type: 'ignore' };
    }
    const next = nearestInDirection(active, pool, key);
    return next ? { type: 'focus', el: next } : { type: 'ignore' };
  }

  if (key === 'ArrowUp' && !inRail) {
    if (!active || !page.includes(active)) return { type: 'open-player' };
    const next = nearestInDirection(active, page, key);
    return next ? { type: 'focus', el: next } : { type: 'open-player' };
  }

  if (key === 'ArrowLeft' && home && !inRail) {
    if (active && page.includes(active)) {
      const next = nearestInDirection(active, page, key);
      if (next) return { type: 'focus', el: next };
    }
    const tab = rail.find((el) => el.classList.contains('on')) ?? rail[0];
    return tab ? { type: 'focus', el: tab } : { type: 'ignore' };
  }

  if (key === 'ArrowRight' && inRail) {
    const target = page[0];
    return target ? { type: 'focus', el: target } : { type: 'ignore' };
  }

  const pool = inRail ? rail : page;
  if (!active || !pool.includes(active)) {
    const first = pool[0];
    return first ? { type: 'focus', el: first } : { type: 'ignore' };
  }
  const next = nearestInDirection(active, pool, key);
  return next ? { type: 'focus', el: next } : { type: 'ignore' };
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function visibleFocusables(root: ParentNode | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true' || el.closest('[inert]')) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  });
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]');
}

/** Слушает стрелки, пока профиль — телевизор. */
export function bindTvRemote(isActive: () => boolean, player: { expanded: boolean; openExpanded: () => void; closeExpanded: () => void }) {
  function arrowOf(event: KeyboardEvent): TvArrow | null {
    if (isTvArrow(event.key)) return event.key;
    if (event.keyCode === 19) return 'ArrowUp';
    if (event.keyCode === 20) return 'ArrowDown';
    if (event.keyCode === 21) return 'ArrowLeft';
    if (event.keyCode === 22) return 'ArrowRight';
    return null;
  }

  function onKey(event: KeyboardEvent) {
    const key = arrowOf(event);
    const onSeek = event.target instanceof HTMLElement && !!event.target.closest('.seek-bar');
    if (!isActive() || event.repeat || !key || isTyping(event.target)) return;
    if (onSeek && (key === 'ArrowLeft' || key === 'ArrowRight')) return;
    const menuRoot = document.querySelector('.clip-quality, .select-menu, .sheet, .ctx');
    const menuOpen = menuRoot instanceof HTMLElement && menuRoot.getBoundingClientRect().height > 0;
    const home = !!document.querySelector('.tv-home');
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const action = tvRemoteAction({
      key,
      expanded: player.expanded,
      home,
      active: active && active !== document.body && active !== document.documentElement ? active : null,
      page: visibleFocusables(document.querySelector('.sky-column')),
      rail: visibleFocusables(document.querySelector('.tabbar')),
      player: visibleFocusables(document.querySelector('.now-playing')),
      menu: menuOpen && menuRoot instanceof HTMLElement ? visibleFocusables(menuRoot) : [],
    });
    if (action.type === 'ignore') return;
    event.preventDefault();
    event.stopPropagation();
    if (action.type === 'open-player') {
      player.openExpanded();
      return;
    }
    if (action.type === 'close-player') {
      player.closeExpanded();
      return;
    }
    action.el.focus();
  }

  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}
