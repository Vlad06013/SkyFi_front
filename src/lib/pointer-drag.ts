export function ratioFromClientX(clientX: number, el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  if (!rect.width) return 0;
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
}

export function trackPointer(
  event: PointerEvent,
  handlers: {
    move: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
  },
) {
  const pointerId = event.pointerId;
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;

  if (event.cancelable) event.preventDefault();

  if (target) {
    try {
      target.setPointerCapture(pointerId);
    } catch {
      /* capture is optional; window listeners still run */
    }
  }

  const move = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    if (next.cancelable) next.preventDefault();
    handlers.move(next);
  };

  const up = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    cleanup();
    handlers.up(next);
  };

  const onTouchMove = (touchEvent: TouchEvent) => {
    if (touchEvent.cancelable) touchEvent.preventDefault();
  };

  function cleanup() {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    document.removeEventListener('touchmove', onTouchMove, true);
    if (target?.hasPointerCapture(pointerId)) {
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }
  }

  window.addEventListener('pointermove', move, { capture: true, passive: false });
  window.addEventListener('pointerup', up, { capture: true });
  window.addEventListener('pointercancel', up, { capture: true });
  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
}
