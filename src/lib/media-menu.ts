import type { AnySnapshot, SnapshotSource } from '@/types';
import { artistsLine } from '@/lib/cover';

export type MenuAtomId =
  | 'listen'
  | 'queue'
  | 'friend-queue'
  | 'like'
  | 'playlist'
  | 'download'
  | 'share'
  | 'edit'
  | 'delete-playlist'
  | 'delete'
  | 'lyrics'
  | 'devices';

export type MenuContext =
  | 'my-tracks'
  | 'my-playlists'
  | 'my-playlist-track'
  | 'my-playlist-video'
  | 'my-albums'
  | 'my-album-track'
  | 'my-artists'
  | 'my-videos'
  | 'my-uploads'
  | 'my-downloaded'
  | 'friend-queue-track'
  | 'friend-queue-video'
  | 'now-track'
  | 'now-video';

export type MediaSheet = 'friend-queue' | 'friend-share' | 'playlist' | 'share' | 'devices' | null;

export type MenuAction = MenuAtomId;

export type MenuEntity = {
  title: string;
  artist: string;
  source: SnapshotSource;
  sourceId: string;
  snapshot?: AnySnapshot;
};

export type MenuItem = {
  id: MenuAtomId;
  label: string;
  icon: string;
  danger?: boolean;
  liked?: boolean;
  /** Офлайн-гейт (optimizations.md «Контекстное меню строки в офлайне»): пункт неактивен. */
  disabled?: boolean;
};

export type MenuItemState = {
  liked: boolean;
  downloaded: boolean;
};

type MatrixEntry = MenuAtomId | { id: MenuAtomId; when: (entity: MenuEntity) => boolean };

/** Матрица «контекст → набор атомов» — источник истины по пунктам меню. */
const menuMatrix: Record<MenuContext, MatrixEntry[]> = {
  'my-tracks': ['queue', 'friend-queue', 'like', 'playlist', 'download', 'share'],
  'my-playlists': [
    'listen',
    'like',
    'download',
    'share',
    'edit',
    { id: 'delete', when: (entity) => entity.source === 'skyfi' },
  ],
  'my-playlist-track': ['queue', 'friend-queue', 'like', 'download', 'share', 'delete-playlist'],
  'my-playlist-video': ['queue', 'friend-queue', 'like', 'share', 'delete-playlist'],
  'my-albums': ['listen', 'like', 'download', 'share'],
  'my-album-track': ['queue', 'friend-queue', 'like', 'download', 'playlist', 'share'],
  'my-artists': ['listen', 'like', 'share'],
  'my-videos': ['queue', 'friend-queue', 'like', 'playlist', 'share'],
  'my-uploads': ['queue', 'friend-queue', 'like', 'download', 'playlist', 'share', 'edit', 'delete'],
  'my-downloaded': ['queue', 'friend-queue', 'like', 'download', 'playlist', 'share'],
  'friend-queue-track': ['like', 'download', 'playlist', 'share'],
  'friend-queue-video': ['like', 'playlist', 'share'],
  'now-track': ['queue', 'friend-queue', 'like', 'download', 'playlist', 'share', 'lyrics', 'devices'],
  'now-video': ['queue', 'friend-queue', 'like', 'playlist', 'share', 'lyrics', 'devices'],
};

const menuIcons: Record<MenuAtomId, string> = {
  listen: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />',
  queue:
    '<path d="M3 6h11M3 12h11M3 18h6.5" /><path d="M13.6 7 22 12l-8.4 5z" fill="currentColor" stroke="none" />',
  'friend-queue':
    '<circle cx="8.2" cy="8" r="3.1" /><path d="M3.4 19c.6-2.8 2.5-4.2 4.8-4.2s4.2 1.4 4.8 4.2" /><path d="M14.2 10.2 21.2 14.2 14.2 18.2z" fill="currentColor" stroke="none" />',
  like:
    '<path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />',
  playlist: '<path d="M3 6h12M3 12h8" /><path d="M18 10.5v11M12.5 16h11" stroke-width="2.4" />',
  download: '<path d="M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5" /><path d="M5 17h14" />',
  share:
    '<path d="M8 9.5H6.5A2.5 2.5 0 0 0 4 12v7.5A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V12a2.5 2.5 0 0 0-2.5-2.5H16" /><path d="M12 15.5V3m0 0 3.6 3.6M12 3 8.4 6.6" />',
  edit: '<path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />',
  'delete-playlist': '<path d="M5 5l14 14M19 5 5 19" />',
  delete: '<path d="M5 5l14 14M19 5 5 19" />',
  lyrics:
    '<rect x="6" y="3.5" width="12" height="17" rx="1.8" /><path d="M9 8.4h6M9 12h6M9 15.6h4" />',
  devices: '<rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M10.5 18.6h3" />',
};

function toMenuItem(id: MenuAtomId, state: MenuItemState): MenuItem {
  if (id === 'like') {
    return {
      id,
      label: state.liked ? 'Убрать из избранного' : 'В избранное',
      icon: menuIcons.like,
      liked: state.liked,
    };
  }
  if (id === 'download') {
    return {
      id,
      label: state.downloaded ? 'Удалить скачанное' : 'Скачать',
      icon: menuIcons.download,
      danger: state.downloaded,
    };
  }
  const labels: Record<Exclude<MenuAtomId, 'like' | 'download'>, string> = {
    listen: 'Слушать',
    queue: 'В очередь',
    'friend-queue': 'В очередь другу',
    playlist: 'В плейлист',
    share: 'Поделиться',
    edit: 'Изменить',
    'delete-playlist': 'Удалить из плейлиста',
    delete: 'Удалить',
    lyrics: 'Текст',
    devices: 'Устройства',
  };
  const danger = id === 'delete' || id === 'delete-playlist';
  return { id, label: labels[id], icon: menuIcons[id], danger };
}

/**
 * Собрать пункты меню для контекста. В офлайне (offline=true) активны
 * «сердечко» (отмена буферного удаления — на избранном), «удалить
 * скачанное» и «В очередь» для скачанного (локальная очередь играется
 * и без сети, добавки дошлются на сервер при коннекте — баг 24);
 * всё остальное disabled. Правило — «разрешены существующие», новых
 * атомов не добавляем.
 */
export function buildMenuItems(context: MenuContext, entity: MenuEntity, state: MenuItemState, offline = false): MenuItem[] {
  return menuMatrix[context]
    .filter((entry) => (typeof entry === 'string' ? true : entry.when(entity)))
    .map((entry) => toMenuItem(typeof entry === 'string' ? entry : entry.id, state))
    .map((item) => {
      if (!offline) return item;
      if (item.id === 'like') return { ...item, disabled: !state.liked };
      if (item.id === 'download') return { ...item, disabled: !state.downloaded };
      if (item.id === 'queue') return { ...item, disabled: !state.downloaded };
      return { ...item, disabled: true };
    });
}

export function entityFromSnapshot(snapshot: AnySnapshot, artist = artistsLine(snapshot.artists)): MenuEntity {
  return {
    title: snapshot.title,
    artist: artist || snapshot.title,
    source: snapshot.source_type,
    sourceId: snapshot.source_id,
    snapshot,
  };
}

const menuRowPx = 38.2;
const menuChromePx = 18;

export function menuHeight(items: MenuItem[]) {
  return Math.ceil(items.length * menuRowPx) + menuChromePx;
}

export function menuAnchor(event: MouseEvent, items: MenuItem[]) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const height = menuHeight(items);
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const top =
    spaceBelow < height && rect.top > height
      ? Math.max(12, rect.top - height - 4)
      : Math.min(rect.bottom + 4, window.innerHeight - height - 12);
  return {
    top,
    right: Math.max(12, window.innerWidth - rect.right),
  };
}
