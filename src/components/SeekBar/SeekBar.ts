import { defineComponent, onBeforeUnmount } from 'vue';
import type { PropType } from 'vue';
import { ratioFromClientX, trackPointer } from '@/lib/pointer-drag';

/** Буферизованный диапазон в долях длительности (0..1). */
export interface BufferedRange {
  start: number;
  end: number;
}

/** Короткий клик пульта — одна секунда, не скачок на несколько процентов. */
export const REMOTE_NUDGE_SEC = 1;
/** Пока жест короче этого, идёт только нудж: удержание ещё не разогналось. */
export const REMOTE_HOLD_GRACE_MS = 280;

/**
 * Секунды медиа в секунду удержания. Сначала медленно, за ~1.4 с выходит
 * на потолок: длинный ролик не пролетает целиком от одного удержания.
 */
export function remoteScrubVelocity(heldMs: number, durationSec: number): number {
  const t = Math.max(0, heldMs) / 1000;
  const cap = durationSec > 0 ? Math.min(90, Math.max(8, durationSec / 6)) : 24;
  const ramp = Math.min(1, t / 1.4);
  return 3 + (cap - 3) * ramp * ramp;
}

export default defineComponent({
  name: 'SeekBar',
  props: {
    modelValue: { type: Number, required: true },
    label: { type: String, required: true },
    buffered: { type: Array as PropType<BufferedRange[]>, default: () => [] },
    /** Длительность в секундах. 0 — шкала сама по себе проценты (громкость). */
    duration: { type: Number, default: 0 },
    tabIndex: { type: [Number, String] as PropType<number | string>, default: 0 },
  },
  emits: ['update:modelValue', 'scrub', 'scrubend'],
  setup(props, { emit }) {
    function setFromEvent(event: PointerEvent, el: HTMLElement) {
      emit('update:modelValue', ratioFromClientX(event.clientX, el) * 100);
    }

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.stopPropagation();
      const el = event.currentTarget as HTMLElement;
      dragging = true;
      setFromEvent(event, el);
      emitScrub(event, el);
      trackPointer(event, {
        move: (next) => {
          setFromEvent(next, el);
          emitScrub(next, el);
        },
        up: () => {
          dragging = false;
          emit('scrubend');
        },
      });
    }

    function onPointerLeave() {
      if (dragging) return;
      emit('scrubend');
    }

    let dragging = false;

    function emitScrub(event: PointerEvent, el: HTMLElement) {
      if (props.duration <= 0) return;
      emit('scrub', ratioFromClientX(event.clientX, el));
    }

    let holdDir = 0;
    let holdStarted = 0;
    let lastFrame = 0;
    let cursor = 0;
    let raf = 0;
    let stopKeyUp: (() => void) | null = null;

    function emitPercent(value: number) {
      cursor = Math.min(100, Math.max(0, value));
      emit('update:modelValue', cursor);
    }

    function stopHold() {
      holdDir = 0;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      stopKeyUp?.();
      stopKeyUp = null;
    }

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      if (!holdDir) return;
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      const held = now - holdStarted;
      if (held < REMOTE_HOLD_GRACE_MS) return;
      const duration = props.duration;
      const speed = remoteScrubVelocity(held - REMOTE_HOLD_GRACE_MS, duration);
      const delta = duration > 0 ? (speed * dt / duration) * 100 : speed * dt;
      emitPercent(cursor + holdDir * delta);
    }

    function isLeft(event: KeyboardEvent) {
      return event.key === 'ArrowLeft' || event.keyCode === 21;
    }

    function isRight(event: KeyboardEvent) {
      return event.key === 'ArrowRight' || event.keyCode === 22;
    }

    /** Пульт: тап сдвигает на секунду, удержание разгоняется плавно. */
    function onKeydown(event: KeyboardEvent) {
      const dir = isRight(event) ? 1 : isLeft(event) ? -1 : 0;
      if (!dir) return;
      event.preventDefault();
      event.stopPropagation();
      if (holdDir === dir) return;
      stopHold();
      holdDir = dir;
      holdStarted = performance.now();
      lastFrame = holdStarted;
      cursor = props.modelValue;
      const duration = props.duration;
      const nudge = duration > 0 ? (REMOTE_NUDGE_SEC / duration) * 100 : 1;
      emitPercent(cursor + dir * nudge);
      const onUp = (up: KeyboardEvent) => {
        const released = dir > 0 ? isRight(up) : isLeft(up);
        if (!released) return;
        stopHold();
      };
      stopKeyUp = () => window.removeEventListener('keyup', onUp);
      window.addEventListener('keyup', onUp);
      raf = requestAnimationFrame(tick);
    }

    onBeforeUnmount(stopHold);

    return { onPointerDown, onPointerLeave, onKeydown };
  },
});
