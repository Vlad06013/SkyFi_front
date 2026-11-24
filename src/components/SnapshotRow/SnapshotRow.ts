import { computed, defineComponent, type PropType } from 'vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { coverVar } from '@/lib/cover';
import { formatTime } from '@/lib/time';
import type { SnapshotSource } from '@/types';

export type SnapshotRowKind = 'track' | 'video' | 'media';

/**
 * Единая строка списка снапшотов. Индикаторы (играет / в избранном /
 * скачан) рисуются тут и нигде больше — чтобы не править разметку
 * по экранам. Форма строки: track — квадрат 44px, video — превью
 * 16:9, media — обложка 44px (round — круг для артистов).
 */
export default defineComponent({
  name: 'SnapshotRow',
  components: { SourceBadge },
  props: {
    kind: { type: String as PropType<SnapshotRowKind>, default: 'track' },
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    source: { type: String as PropType<SnapshotSource>, required: true },
    cover: { type: String, default: '' },
    round: { type: Boolean, default: false },
    playing: { type: Boolean, default: false },
    liked: { type: Boolean, default: false },
    downloaded: { type: Boolean, default: false },
    offline: { type: Boolean, default: false },
    sortable: { type: Boolean, default: false },
    removable: { type: Boolean, default: false },
    menuable: { type: Boolean, default: true },
    /** Длительность трека/видео, мс. null — не показываем. */
    durationMs: { type: Number as PropType<number | null>, default: null },
    dragging: { type: Boolean, default: false },
    dragStyle: { type: Object as PropType<Record<string, string> | undefined>, default: undefined },
  },
  emits: ['open', 'menu', 'sort', 'remove'],
  setup(props, { emit }) {
    const rootClass = computed(() => {
      if (props.kind === 'video') return 'vid-row';
      if (props.kind === 'media') return 'pl-row';
      return 'track-row';
    });

    const isVideo = computed(() => props.kind === 'video');
    const isPlayable = computed(() => props.kind !== 'media');
    const durationLabel = computed(() => {
      const ms = props.durationMs;
      if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
      return formatTime(ms / 1000);
    });

    return { emit, rootClass, isVideo, isPlayable, coverVar, durationLabel };
  },
});
