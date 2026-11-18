import { computed, defineComponent, type PropType } from 'vue';
import type { SnapshotSource } from '@/types';
import { sourceTitle } from '@/lib/cover';

export default defineComponent({
  name: 'SourceBadge',
  props: {
    source: { type: String as PropType<SnapshotSource>, required: true },
  },
  setup(props) {
    const label = computed(() => sourceTitle(props.source));

    return { label };
  },
});
