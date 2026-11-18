import { defineComponent, type PropType } from 'vue';
import ContextMenu from '@/components/ContextMenu/ContextMenu.vue';
import type { MenuVariant } from '@/lib/media-menu';

export default defineComponent({
  name: 'EntityMenu',
  components: { ContextMenu },
  props: {
    open: { type: Boolean, required: true },
    top: { type: Number, required: true },
    right: { type: Number, required: true },
    variant: { type: String as PropType<MenuVariant>, required: true },
  },
  emits: ['close', 'action'],
  setup(props, { emit }) {
    return { emit };
  },
});
