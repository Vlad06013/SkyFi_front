import { computed, defineComponent, ref, watch, type PropType } from 'vue';
import { storeToRefs } from 'pinia';
import AppSheet from '@/components/AppSheet/AppSheet.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { coverVar } from '@/lib/cover';
import { favoritePlaylists } from '@/mocks/catalog';
import { useFriendsStore } from '@/stores/friends';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type { MediaSheet, MenuEntity } from '@/lib/media-menu';
import type { PlayerDevice } from '@/types';

export default defineComponent({
  name: 'MediaActionSheet',
  components: { AppSheet, SnapshotRow, SourceBadge },
  props: {
    sheet: { type: String as PropType<MediaSheet>, default: null },
    entity: { type: Object as PropType<MenuEntity>, required: true },
  },
  emits: ['close', 'update:sheet'],
  setup(props, { emit }) {
    const player = usePlayerStore();
    const { state, localDeviceId } = storeToRefs(player);
    const toast = useToastStore();
    const friendsStore = useFriendsStore();
    const friendQuery = ref('');
    const friendFocus = ref(false);

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
      if (!q) return friendsStore.friends;
      return friendsStore.friends.filter(
        (friend) => friend.name.toLowerCase().includes(q) || friend.email.toLowerCase().includes(q),
      );
    });

    const coverImage = computed(() => {
      const snapshot = props.entity.snapshot;
      if (!snapshot) return '';
      if (snapshot.type === 'video') return snapshot.cover_url ?? '';
      if (snapshot.type === 'track') return snapshot.album?.cover_url ?? '';
      return '';
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

    async function shareExternally() {
      const url = `https://skyfi.app/t/${props.entity.sourceId}`;
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: props.entity.title,
            text: `${props.entity.title} — ${props.entity.artist}`,
            url,
          });
        } catch {
          /* пользователь закрыл системный диалог */
        }
        return;
      }
      toast.show('Поделиться', 'не поддерживается здесь · ссылка в буфере');
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

    return {
      state,
      title,
      friendQuery,
      friendFocus,
      visibleFriends,
      favoritePlaylists,
      coverImage,
      close,
      pickQueue,
      pickShare,
      pickPlaylist,
      openInAppShare,
      shareExternally,
      deviceCaption,
      pickDevice,
      coverVar,
    };
  },
});
