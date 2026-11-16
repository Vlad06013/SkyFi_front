import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { entityFromSnapshot, menuAnchor, type MediaSheet, type MenuAction, type MenuEntity, type MenuVariant } from '@/lib/media-menu';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type { AnySnapshot, TrackSnapshot } from '@/types';

export function useMediaMenu(hooks: {
  onListen?: (entity: MenuEntity) => void;
  onEdit?: (entity: MenuEntity) => void;
  onDelete?: (entity: MenuEntity) => void;
  onLyrics?: () => void;
} = {}) {
  const player = usePlayerStore();
  const { current, queue } = storeToRefs(player);
  const toast = useToastStore();
  const menu = ref<{
    variant: MenuVariant;
    entity: MenuEntity;
    top: number;
    right: number;
  } | null>(null);
  const sheet = ref<MediaSheet>(null);
  const entity = ref<MenuEntity>({
    title: '',
    artist: '',
    source: 'skyfi',
    sourceId: '',
  });

  const open = computed(() => Boolean(menu.value));
  const variant = computed(() => menu.value?.variant ?? 'track');
  const top = computed(() => menu.value?.top ?? 0);
  const right = computed(() => menu.value?.right ?? 12);

  function openMenu(event: MouseEvent, nextVariant: MenuVariant, next: MenuEntity) {
    entity.value = next;
    menu.value = { variant: nextVariant, entity: next, ...menuAnchor(event, nextVariant) };
  }

  function openSnapshotMenu(event: MouseEvent, snapshot: AnySnapshot, nextVariant: MenuVariant, artist?: string) {
    openMenu(event, nextVariant, entityFromSnapshot(snapshot, artist));
  }

  function closeMenu() {
    menu.value = null;
  }

  function enqueue(track: TrackSnapshot) {
    const playingId = current.value && 'source_id' in current.value ? current.value.source_id : null;
    if (track.source_id === playingId) {
      toast.show(track.title, 'уже играет');
      return;
    }
    if (queue.value.some((item) => item.source_id === track.source_id)) {
      toast.show(track.title, 'уже в очереди');
      return;
    }
    queue.value = [...queue.value, track];
    toast.show(`${track.title} — ${entity.value.artist}`, 'добавлено в очередь');
  }

  function run(action: MenuAction) {
    const target = menu.value?.entity ?? entity.value;
    menu.value = null;
    entity.value = target;
    if (action === 'queue' && target.snapshot?.type === 'track') {
      enqueue(target.snapshot);
      return;
    }
    if (action === 'like') {
      toast.show(target.title, 'уже в избранном');
      return;
    }
    if (action === 'download') {
      toast.show(`${target.title} — ${target.artist}`, 'скачано');
      return;
    }
    if (action === 'friend-queue') {
      sheet.value = 'friend-queue';
      return;
    }
    if (action === 'playlist') {
      sheet.value = 'playlist';
      return;
    }
    if (action === 'share') {
      sheet.value = 'share';
      return;
    }
    if (action === 'devices') {
      sheet.value = 'devices';
      return;
    }
    if (action === 'listen') {
      if (target.snapshot?.type === 'track') player.playSnapshot(target.snapshot);
      hooks.onListen?.(target);
      return;
    }
    if (action === 'edit') {
      hooks.onEdit?.(target);
      return;
    }
    if (action === 'delete') {
      hooks.onDelete?.(target);
      return;
    }
    if (action === 'lyrics') {
      hooks.onLyrics?.();
    }
  }

  return {
    open,
    variant,
    top,
    right,
    sheet,
    entity,
    openMenu,
    openSnapshotMenu,
    closeMenu,
    run,
  };
}
