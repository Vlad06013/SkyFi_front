import { computed, defineComponent, type PropType } from 'vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { coverVar } from '@/lib/cover';
import { formatTime } from '@/lib/time';
import { useDownloadsStore } from '@/stores/downloads';
import { useOnlineStore } from '@/stores/online';
import type { SnapshotSource } from '@/types';

export type SnapshotRowKind = 'track' | 'video' | 'media';
export type SnapshotEntityType = 'track' | 'album' | 'playlist' | 'artist' | 'video';

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
    sourceId: { type: String, default: '' },
    /** album/playlist отличаются только этим: у обоих kind=media. */
    entityType: { type: String as PropType<SnapshotEntityType | ''>, default: '' },
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
    const downloads = useDownloadsStore();
    const online = useOnlineStore();
    const rootClass = computed(() => {
      if (props.kind === 'video') return 'vid-row';
      if (props.kind === 'media') return 'pl-row';
      return 'track-row';
    });

    const isVideo = computed(() => props.kind === 'video');
    const isPlayable = computed(() => props.kind !== 'media');
    const resolvedType = computed<SnapshotEntityType | ''>(() => {
      if (props.entityType) return props.entityType;
      if (props.kind === 'video') return 'video';
      if (props.kind === 'track') return 'track';
      if (props.round) return 'artist';
      return '';
    });

    const downloadPct = computed(() => {
      if (!props.sourceId) return null;
      if (resolvedType.value === 'track') return downloads.trackFilePct(props.source, props.sourceId);
      if (resolvedType.value === 'album' || resolvedType.value === 'playlist') {
        return downloads.collectionProgress(resolvedType.value, props.source, props.sourceId);
      }
      return null;
    });
    const downloadArc = computed(() => Math.round(((downloadPct.value ?? 0) / 100) * 94));
    const showDownloaded = computed(
      () =>
        downloadPct.value === null &&
        (props.downloaded ||
          (resolvedType.value === 'track' && props.sourceId
            ? downloads.isEntityDownloaded('track', props.source, props.sourceId)
            : false) ||
          ((resolvedType.value === 'album' || resolvedType.value === 'playlist') &&
            props.sourceId &&
            downloads.isEntityDownloaded(resolvedType.value, props.source, props.sourceId))),
    );

    const collectionDownloaded = computed(() => {
      const type = resolvedType.value;
      if (type !== 'album' && type !== 'playlist') return false;
      return downloads.isEntityDownloaded(type, props.source, props.sourceId);
    });

    /**
     * Офлайн: нескачанное видно, но не открывается.
     * Трек и загрузка — если нет файла (играющий трек остаётся кликабельным).
     * Альбом и плейлист — если скачаны не все треки.
     * Артиста и видео скачать нельзя.
     */
    const unavailable = computed(() => {
      if (props.offline) return true;
      if (online.isOnline !== false) return false;
      const type = resolvedType.value;
      if (type === 'artist' || type === 'video') return true;
      if (type === 'track') return !props.playing && !showDownloaded.value;
      if (type === 'album' || type === 'playlist') return !collectionDownloaded.value;
      return props.kind === 'media';
    });

    function onOpen() {
      if (unavailable.value) return;
      emit('open');
    }

    function onMenu(event: MouseEvent) {
      if (unavailable.value) return;
      emit('menu', event);
    }

    const durationLabel = computed(() => {
      const ms = props.durationMs;
      if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
      return formatTime(ms / 1000);
    });

    return {
      emit,
      rootClass,
      isVideo,
      isPlayable,
      coverVar,
      durationLabel,
      downloadPct,
      downloadArc,
      showDownloaded,
      unavailable,
      onOpen,
      onMenu,
    };
  },
});
