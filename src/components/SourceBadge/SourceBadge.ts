import { computed, defineComponent, type PropType } from 'vue';
import type { SnapshotSource } from '@/types';
import { sourceTitle } from '@/lib/cover';

export default defineComponent({
  name: 'SourceBadge',
  props: {
    source: { type: String as PropType<SnapshotSource>, required: true },
    /** Подпись поверх sourceTitle: в ряду поиска у файла написано «Загрузки». */
    caption: { type: String, default: '' },
  },
  setup(props) {
    const label = computed(() => props.caption || sourceTitle(props.source));

    return { label };
  },
});
