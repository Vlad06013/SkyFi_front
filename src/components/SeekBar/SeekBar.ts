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

    return { onPointerDown };
  },
});
