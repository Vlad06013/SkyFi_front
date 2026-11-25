import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import { ratioFromClientX, trackPointer } from '@/lib/pointer-drag';

/** Буферизованный диапазон в долях длительности (0..1). */
export interface BufferedRange {
  start: number;
  end: number;
}

export default defineComponent({
  name: 'SeekBar',
  props: {
    modelValue: { type: Number, required: true },
    label: { type: String, required: true },
    buffered: { type: Array as PropType<BufferedRange[]>, default: () => [] },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    function setFromEvent(event: PointerEvent, el: HTMLElement) {
      emit('update:modelValue', ratioFromClientX(event.clientX, el) * 100);
    }

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.stopPropagation();
      const el = event.currentTarget as HTMLElement;
      setFromEvent(event, el);
      trackPointer(event, {
        move: (next) => setFromEvent(next, el),
        up: () => undefined,
      });
    }

    /** Пульт телевизора: влево/вправо двигают ползунок, а не фокус. */
    function onKeydown(event: KeyboardEvent) {
      const left = event.key === 'ArrowLeft' || event.keyCode === 21;
      const right = event.key === 'ArrowRight' || event.keyCode === 22;
      if (!left && !right) return;
      event.preventDefault();
      event.stopPropagation();
      const next = Math.min(100, Math.max(0, props.modelValue + (right ? 5 : -5)));
      emit('update:modelValue', next);
    }

    return { onPointerDown, onKeydown };
  },
});
