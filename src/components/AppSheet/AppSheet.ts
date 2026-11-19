import { defineComponent, ref, watch } from 'vue';
import { trackPointer } from '@/lib/pointer-drag';

const closeThreshold = 88;

export default defineComponent({
  name: 'AppSheet',
  props: {
    open: { type: Boolean, required: true },
    title: { type: String, default: '' },
  },
  emits: ['close'],
  setup(props, { emit }) {
    const dragging = ref(false);
    const dragY = ref(0);

    const dragStyle = ref<{ transform?: string }>({});

    function close() {
      emit('close');
    }

    function onDragStart(event: PointerEvent) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.stopPropagation();
      const startY = event.clientY;
      dragging.value = true;
      dragY.value = 0;
      dragStyle.value = {};
      trackPointer(event, {
        move: (next) => {
          dragY.value = Math.max(0, next.clientY - startY);
          dragStyle.value = { transform: `translateY(${dragY.value}px)` };
        },
        up: () => {
          const shouldClose = dragY.value > closeThreshold;
          dragging.value = false;
          dragY.value = 0;
          dragStyle.value = {};
          if (shouldClose) close();
        },
      });
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }

    watch(
      () => props.open,
      (isOpen) => {
        if (isOpen) window.addEventListener('keydown', onKey);
        else window.removeEventListener('keydown', onKey);
      },
    );

    return { dragging, dragStyle, close, onDragStart };
  },
});
