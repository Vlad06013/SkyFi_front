import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import {
  buildMenuItems,
  entityFromSnapshot,
  menuAnchor,
  type MediaSheet,
  type MenuAction,
  type MenuContext,
  type MenuEntity,
  type MenuItem,
} from '@/lib/media-menu';
import { usePlayerStore } from '@/stores/player';
import { useFavoritesStore } from '@/stores/favorites';
import { useDownloadsStore } from '@/stores/downloads';
import { useToastStore } from '@/stores/toast';
import type { AnySnapshot } from '@/types';

export function useMediaMenu(hooks: {
  onListen?: (entity: MenuEntity) => void;
  onEdit?: (entity: MenuEntity) => void;
  onDelete?: (entity: MenuEntity) => void;
  onDeletePlaylist?: (entity: MenuEntity) => void;
  onLyrics?: () => void;
  onLike?: (entity: MenuEntity) => void;
} = {}) {
  const player = usePlayerStore();
  const { current, queue } = storeToRefs(player);
  const favorites = useFavoritesStore();
  const downloads = useDownloadsStore();
  const toast = useToastStore();
  const menu = ref<{
    context: MenuContext;
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
  const top = computed(() => menu.value?.top ?? 0);
  const right = computed(() => menu.value?.right ?? 12);

  function resolveItems(context: MenuContext, target: MenuEntity): MenuItem[] {
    return buildMenuItems(context, target, {
      liked: favorites.has(target.snapshot),
      downloaded: target.snapshot ? downloads.isDownloaded(target.snapshot) : false,
    });
  }

  const items = computed(() => (menu.value ? resolveItems(menu.value.context, menu.value.entity) : []));

  function openMenu(event: MouseEvent, context: MenuContext, next: MenuEntity) {
    entity.value = next;
    menu.value = { context, entity: next, ...menuAnchor(event, resolveItems(context, next)) };
  }

  function openSnapshotMenu(event: MouseEvent, snapshot: AnySnapshot, context: MenuContext, artist?: string) {
    const next = entityFromSnapshot(snapshot, artist);
    if (
      menu.value &&
      menu.value.entity.sourceId === next.sourceId &&
      menu.value.context === context
    ) {
      menu.value = null;
      return;
    }
    openMenu(event, context, next);
  }

  function closeMenu() {
    menu.value = null;
  }

  async function enqueue(snapshot: AnySnapshot) {
    const playingId = current.value && 'source_id' in current.value ? current.value.source_id : null;
    if (snapshot.source_id === playingId) {
      toast.show(snapshot.title, 'уже играет');
      return;
    }
    if (queue.value.some((item) => item.snapshot?.source_id === snapshot.source_id)) {
      toast.show(snapshot.title, 'уже в очереди');
      return;
    }
    const added = await player.enqueueSnapshot(snapshot);
    if (added) {
      toast.show(`${snapshot.title} — ${entity.value.artist}`, 'добавлено в очередь');
    }
  }

  function run(action: MenuAction) {
    const target = menu.value?.entity ?? entity.value;
    menu.value = null;
    entity.value = target;
    if (action === 'queue' && target.snapshot) {
      void enqueue(target.snapshot);
      return;
    }
    if (action === 'like') {
      if (hooks.onLike) {
        hooks.onLike(target);
        return;
      }
      if (target.snapshot) {
        void favorites
          .toggle(target.snapshot)
          .then((added) => {
            toast.show(target.title, added ? 'добавлено в избранное' : 'убрано из избранного');
          })
          .catch((error: unknown) => {
            toast.show(error instanceof Error ? error.message : 'Не удалось обновить избранное', '', true);
          });
        return;
      }
      toast.show(target.title, 'уже в избранном');
      return;
    }
    if (action === 'download') {
      if (!target.snapshot) return;
      if (downloads.isDownloaded(target.snapshot)) {
        downloads.remove(target.snapshot);
        toast.show(target.title, 'удалено из скачанного');
        return;
      }
      if (downloads.add(target.snapshot)) {
        toast.show(`${target.title} — ${target.artist}`, 'скачано');
      } else {
        toast.show(target.title, 'скачивание пока только для треков');
      }
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
      if (target.snapshot && (target.snapshot.type === 'track' || target.snapshot.type === 'video')) {
        player.playSnapshot(target.snapshot);
      }
      hooks.onListen?.(target);
      return;
    }
    if (action === 'edit') {
      if (hooks.onEdit) hooks.onEdit(target);
      else toast.show(target.title, 'изменение — скоро');
      return;
    }
    if (action === 'delete-playlist') {
      if (hooks.onDeletePlaylist) hooks.onDeletePlaylist(target);
      else toast.show(target.title, 'удаление — скоро');
      return;
    }
    if (action === 'delete') {
      if (hooks.onDelete) hooks.onDelete(target);
      else toast.show(target.title, 'удаление — скоро');
      return;
    }
    if (action === 'lyrics') {
      hooks.onLyrics?.();
    }
  }

  return {
    open,
    items,
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
