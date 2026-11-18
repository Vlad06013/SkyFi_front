import { computed, defineComponent, type PropType } from 'vue';
import ContextMenu from '@/components/ContextMenu/ContextMenu.vue';
import { useFavoritesStore } from '@/stores/favorites';
import type { MenuEntity, MenuVariant } from '@/lib/media-menu';

export default defineComponent({
  name: 'EntityMenu',
  components: { ContextMenu },
  props: {
    open: { type: Boolean, required: true },
    top: { type: Number, required: true },
    right: { type: Number, required: true },
    variant: { type: String as PropType<MenuVariant>, required: true },
    entity: { type: Object as PropType<MenuEntity>, required: true },
  },
  emits: ['close', 'action'],
  setup(props, { emit }) {
    const favorites = useFavoritesStore();
    const isLiked = computed(() => favorites.has(props.entity.snapshot));

    return { emit, isLiked };
  },
});
