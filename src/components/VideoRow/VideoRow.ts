import { defineComponent, type PropType } from 'vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { coverVar } from '@/lib/cover';
import type { SnapshotSource } from '@/types';

export default defineComponent({
  name: 'VideoRow',
  components: { SourceBadge },
  props: {
    title: { type: String, required: true },
    subtitle: { type: String, required: true },
    source: { type: String as PropType<SnapshotSource>, required: true },
    cover: { type: String, default: '' },
    menuable: { type: Boolean, default: true },
  },
  emits: ['open', 'menu'],
  setup(props, { emit }) {
    return { coverVar, emit };
  },
});
