import { defineComponent, onBeforeUnmount, watch } from 'vue';

/**
 * Единое подтверждение деструктивных действий (кит): маска, Esc, свайп вниз
 * не даём — диалог маленький. Подтверждение эмитит confirm и закрывается;
 * само действие и его ошибки — на вызывающей стороне (стор + тост).
 */
export default defineComponent({
  name: 'AppConfirm',
  props: {
    open: { type: Boolean, required: true },
    title: { type: String, default: '' },
    message: { type: String, default: '' },
    confirmLabel: { type: String, default: 'Подтвердить' },
    cancelLabel: { type: String, default: 'Отменить' },
    /** false — нейтральное подтверждение (primary), по умолчанию опасное (danger). */
    danger: { type: Boolean, default: true },
  },
  emits: ['confirm', 'close'],
  setup(props, { emit }) {
    function close() {
      emit('close');
    }

    function onConfirm() {
      emit('confirm');
      close();
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
      // Монтирование сразу с open=true — тоже подписка.
      { immediate: true },
    );

    onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

    return { close, onConfirm };
  },
});
