import { defineComponent, type CSSProperties, type PropType } from 'vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { consumeSortClick } from '@/lib/list-sort';
import { coverVar } from '@/lib/cover';
import type { SnapshotSource } from '@/types';

export default defineComponent({
  name: 'TrackRow',
  components: { SourceBadge },
  props: {
    title: { type: String, required: true },
    artist: { type: String, required: true },
    source: { type: String as PropType<SnapshotSource>, required: true },
    playing: { type: Boolean, default: false },
    offline: { type: Boolean, default: false },
    sortable: { type: Boolean, default: false },
    menuable: { type: Boolean, default: true },
    dragging: { type: Boolean, default: false },
    dragStyle: { type: Object as PropType<CSSProperties>, default: undefined },
  },
  emits: ['play', 'menu', 'sort'],
  setup(props, { emit }) {
    function onPlay() {
      if (consumeSortClick()) return;
      emit('play');
    }

    return {
      coverVar,
      onPlay,
      emit,
    };
  },
});
