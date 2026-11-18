import { computed, defineComponent, ref, watch, type PropType } from 'vue';
import { storeToRefs } from 'pinia';
import MediaRow from '@/components/MediaRow/MediaRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { coverVar } from '@/lib/cover';
import { trackPointer } from '@/lib/pointer-drag';
import { favoritePlaylists } from '@/mocks/catalog';
import { mockFriends } from '@/mocks/friends';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type { MediaSheet, MenuEntity } from '@/lib/media-menu';
import type { PlayerDevice } from '@/types';

export default defineComponent({
  name: 'MediaActionSheet',
  components: { MediaRow, SourceBadge },
  props: {
    sheet: { type: String as PropType<MediaSheet>, default: null },
    entity: { type: Object as PropType<MenuEntity>, required: true },
  },
  emits: ['close', 'update:sheet'],
  setup(props, { emit }) {
    const player = usePlayerStore();
    const { state, localDeviceId } = storeToRefs(player);
    const toast = useToastStore();
    const friendQuery = ref('');
    const friendFocus = ref(false);
    const dragging = ref(false);
    const dragY = ref(0);

    const title = computed(() => {
      if (props.sheet === 'friend-queue') return 'В очередь другу';
      if (props.sheet === 'friend-share') return 'Другу в SkyFi';
      if (props.sheet === 'playlist') return 'В плейлист';
      if (props.sheet === 'share') return 'Поделиться';
      if (props.sheet === 'devices') return 'Устройства';
      return '';
    });

    const visibleFriends = computed(() => {
      const q = friendQuery.value.trim().toLowerCase();
      if (!q) return mockFriends;
      return mockFriends.filter(
        (friend) => friend.name.toLowerCase().includes(q) || friend.email.toLowerCase().includes(q),
      );
    });

    const dragStyle = computed(() => {
      if (!dragY.value) return undefined;
      return { transform: `translateY(${dragY.value}px)` };
    });

    watch(
      () => props.sheet,
      (next) => {
        if (next === 'share') {
          void navigator.clipboard?.writeText(`https://skyfi.app/t/${props.entity.sourceId}`).catch(() => undefined);
        }
        if (next === 'friend-queue' || next === 'friend-share') friendQuery.value = '';
      },
    );

    function close() {
      emit('update:sheet', null);
      emit('close');
    }

    function pickQueue(name: string) {
      toast.show(`${props.entity.title} — ${name} в очередь`, 'отправили другу');
      close();
    }

    function pickShare(name: string) {
      toast.show(`${props.entity.title} — ${props.entity.artist}`, `поделились с ${name}`);
      close();
    }

    function pickPlaylist(name: string) {
      toast.show(`${props.entity.title} — ${props.entity.artist}`, `добавлено в «${name}»`);
      close();
    }

    function openInAppShare() {
      emit('update:sheet', 'friend-share');
    }

    function deviceCaption(device: PlayerDevice) {
      if (device.id === localDeviceId.value) return 'это устройство';
      if (device.id === state.value.active_device_id) return '';
      return 'не активен';
    }

    function pickDevice(id: number) {
      player.activateDevice(id);
      const name = state.value.devices.find((device) => device.id === id)?.name ?? '';
      toast.show(name, 'играет здесь');
      close();
    }

    function onDragStart(event: PointerEvent) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.stopPropagation();
      const startY = event.clientY;
      dragging.value = true;
      dragY.value = 0;
      trackPointer(event, {
        move: (next) => {
          dragY.value = Math.max(0, next.clientY - startY);
        },
        up: () => {
          const shouldClose = dragY.value > 88;
          dragging.value = false;
          if (shouldClose) {
            dragY.value = 0;
            close();
            return;
          }
          dragY.value = 0;
        },
      });
    }

    return {
      state,
      title,
      friendQuery,
      friendFocus,
      visibleFriends,
      favoritePlaylists,
      dragging,
      dragStyle,
      close,
      pickQueue,
      pickShare,
      pickPlaylist,
      openInAppShare,
      deviceCaption,
      pickDevice,
      onDragStart,
      coverVar,
    };
  },
});
