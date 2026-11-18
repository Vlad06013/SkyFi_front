import { computed, defineComponent, onMounted, onBeforeUnmount } from 'vue';

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

    onMounted(() => window.addEventListener('keydown', onKey));
    onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

    return { popStyle, close };
  },
});
