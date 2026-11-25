import { computed, defineComponent, ref, watch, type PropType } from 'vue';
import AppSheet from '@/components/AppSheet/AppSheet.vue';
import SnapshotRow from '@/components/SnapshotRow/SnapshotRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { addToFriendQueue, shareWithFriend } from '@/api/friends';
import { fetchShareUrl } from '@/api/shares';
import { coverVar, trackCover } from '@/lib/cover';
import { friendInitial, friendTone } from '@/lib/friends';
import { favoritePlaylists } from '@/mocks/catalog';
import { useDevicesStore } from '@/stores/devices';
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
    const toast = useToastStore();
    const friendsStore = useFriendsStore();
    const devicesStore = useDevicesStore();
    const playerStore = usePlayerStore();
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

    const shareUrl = ref<string | null>(null);
    const shareLoading = ref(false);
    let sharePromise: Promise<string | null> | null = null;

    /** Публичная ссылка источника с бэка (api.md §13); параллельные вызовы дедуплицируем. */
    function resolveShareUrl(): Promise<string | null> {
      if (shareUrl.value) return Promise.resolve(shareUrl.value);
      if (!props.entity.snapshot || sharePromise) return sharePromise ?? Promise.resolve(null);
      shareLoading.value = true;
      sharePromise = fetchShareUrl(props.entity.snapshot)
        .then((payload) => {
          shareUrl.value = payload.url;
          return payload.url;
        })
        .catch((cause) => {
          toast.show(cause instanceof Error ? cause.message : 'Не удалось получить ссылку', '', true);
          return null;
        })
        .finally(() => {
          shareLoading.value = false;
          sharePromise = null;
        });
      return sharePromise;
    }

    watch(
      () => props.sheet,
      (next) => {
        if (next === 'share') {
          shareUrl.value = null;
          // Открыли «Поделиться» — ссылка запрашивается и сразу копируется.
          void resolveShareUrl().then((url) => {
            if (url) void navigator.clipboard?.writeText(url).catch(() => undefined);
          });
        }
        if (next === 'friend-queue' || next === 'friend-share') {
          friendQuery.value = '';
          void friendsStore.ensure();
        }
        if (next === 'devices') {
          // Presence сокетом не догоняется — при каждом открытии свежий GET.
          void devicesStore.refresh();
        }
      },
      // Монтирование сразу с открытым шитом — тоже обрабатываем.
      { immediate: true },
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
      const url = await resolveShareUrl();
      if (!url) return;
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
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      toast.show('Поделиться', 'не поддерживается здесь · ссылка в буфере');
    }

    const deviceList = computed(() => devicesStore.devices);
    const deviceLoaded = computed(() => devicesStore.loaded);
    // Активное устройство — только из стейта плеера (api.md §4: признака
    // «активности» у самого устройства нет).
    const activeDeviceUuid = computed(() => playerStore.state.active_device_id);
    const myDeviceUuid = computed(() => devicesStore.myDeviceUuid);

    function deviceCaption(device: PlayerDevice) {
      if (device.device_uuid === myDeviceUuid.value) return 'это устройство';
      if (device.device_uuid === activeDeviceUuid.value) return '';
      return 'не активен';
    }

    async function pickDevice(deviceUuid: string) {
      const name = deviceList.value.find((device) => device.device_uuid === deviceUuid)?.name ?? '';
      if (await playerStore.activateDevice(deviceUuid)) {
        toast.show(name, 'играет здесь');
        close();
      }
    }

      return {
      title,
      friendQuery,
      friendFocus,
      visibleFriends,
      favoritePlaylists,
      coverImage,
      shareUrl,
      shareLoading,
      close,
      pickQueue,
      pickShare,
      pickPlaylist,
      openInAppShare,
      shareExternally,
      deviceList,
      deviceLoaded,
      activeDeviceUuid,
      deviceCaption,
      pickDevice,
      friendInitial,
      friendTone,
      coverVar,
    };
  },
});
