import { computed, defineComponent, ref, watch, type PropType } from 'vue';
import { storeToRefs } from 'pinia';
import AppSheet from '@/components/AppSheet/AppSheet.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { addToFriendQueue, shareWithFriend } from '@/api/friends';
import { coverVar, trackCover } from '@/lib/cover';
import { friendInitial, friendTone } from '@/lib/friends';
import { favoritePlaylists } from '@/mocks/catalog';
import { useFriendsStore, type FriendEntry } from '@/stores/friends';
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
      return friendsStore.friends.filter((friend) => friend.user.name.toLowerCase().includes(q));
    });

    const coverImage = computed(() => {
      const snapshot = props.entity.snapshot;
      if (!snapshot) return '';
      if (snapshot.type === 'video') return snapshot.cover_url ?? '';
      if (snapshot.type === 'track') return trackCover(snapshot);
      return '';
    });

    watch(
      () => props.sheet,
      (next) => {
        if (next === 'share') {
          void navigator.clipboard?.writeText(`https://skyfi.app/t/${props.entity.sourceId}`).catch(() => undefined);
        }
        if (next === 'friend-queue' || next === 'friend-share') {
          friendQuery.value = '';
          void friendsStore.ensure();
        }
      },
    );

    function close() {
      emit('update:sheet', null);
      emit('close');
    }

    async function pickQueue(friend: FriendEntry) {
      if (!props.entity.snapshot) return;
      try {
        await addToFriendQueue(friend.user.id, props.entity.snapshot);
        toast.show(`${props.entity.title} — ${friend.user.name} в очередь`, 'отправили другу');
        close();
      } catch (cause) {
        toast.show(cause instanceof Error ? cause.message : 'Не удалось отправить', '', true);
      }
    }

    async function pickShare(friend: FriendEntry) {
      if (!props.entity.snapshot) return;
      try {
        await shareWithFriend(friend.user.id, props.entity.snapshot);
        toast.show(`${props.entity.title} — ${props.entity.artist}`, `поделились с ${friend.user.name}`);
        close();
      } catch (cause) {
        toast.show(cause instanceof Error ? cause.message : 'Не удалось поделиться', '', true);
      }
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
      friendInitial,
      friendTone,
      coverVar,
    };
  },
});
