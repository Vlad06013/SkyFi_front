import type { Router } from 'vue-router';
import { usePlayerStore } from '@/stores/player';
import type { AnySnapshot } from '@/types';

/**
 * Обычный клик по снапшоту (единое поведение списков): трек/видео —
 * сразу в плеер, сущность с деталкой (album/artist/playlist) — на
 * экран деталей.
 */
export function openSnapshot(router: Router, snapshot: AnySnapshot | null | undefined) {
  if (!snapshot) return;
  if (snapshot.type === 'track' || snapshot.type === 'video') {
    usePlayerStore().playSnapshot(snapshot);
    return;
  }
  const paths = { album: '/album', artist: '/artist', playlist: '/playlist' } as const;
  void router.push(`${paths[snapshot.type]}/${snapshot.source_type}/${snapshot.source_id}`);
}
