import { defineComponent, type PropType } from 'vue';
import EntityMenu from '@/components/EntityMenu/EntityMenu.vue';
import MediaActionSheet from '@/components/MediaActionSheet/MediaActionSheet.vue';
import type { MediaSheet, MenuEntity, MenuVariant } from '@/lib/media-menu';

export default defineComponent({
  name: 'MediaOverlays',
  components: { EntityMenu, MediaActionSheet },
  props: {
    open: { type: Boolean, required: true },
    top: { type: Number, required: true },
    right: { type: Number, required: true },
    variant: { type: String as PropType<MenuVariant>, required: true },
    sheet: { type: String as PropType<MediaSheet>, default: null },
    entity: { type: Object as PropType<MenuEntity>, required: true },
  },
  emits: ['close', 'action', 'update:sheet'],
  setup(props, { emit }) {
    return { emit };
  },
});
