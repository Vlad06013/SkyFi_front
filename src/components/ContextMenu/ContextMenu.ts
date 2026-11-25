import { computed, defineComponent, onBeforeUnmount, watch } from 'vue';
import { pushBackOverlay } from '@/lib/hardware-back';

export default defineComponent({
  name: 'ContextMenu',
  props: {
    open: { type: Boolean, required: true },
    top: { type: Number, required: true },
    right: { type: Number, required: true },
  },
  emits: ['close'],
  setup(props, { emit }) {
    const popStyle = computed(() => ({
      top: `${props.top}px`,
      right: `${props.right}px`,
    }));

    function close() {
      emit('close');
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }

    let stopBack: (() => void) | null = null;
    watch(
      () => props.open,
      (isOpen) => {
        if (isOpen) window.addEventListener('keydown', onKey);
        else window.removeEventListener('keydown', onKey);
        stopBack?.();
        stopBack = isOpen ? pushBackOverlay(() => { close(); return true; }) : null;
      },
    );
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', onKey);
      stopBack?.();
    });

    return { popStyle, close };
  },
});
