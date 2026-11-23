import type { Router } from 'vue-router';
import { PLAY_SOURCE_SINGLE } from '@/lib/play-sources';
import { usePlayerStore } from '@/stores/player';
import type { AnySnapshot, PlaySource } from '@/types';

/** Как запускать трек/видео из списка (plan-player.md §2). */
export interface OpenPlayOptions {
  playbackSource?: PlaySource;
  /** Контекст целиком: движок строит переходы сразу, без resolver. */
  contextItems?: AnySnapshot[];
  /** Opaque-ссылка контекста (query поиска, id плейлиста) — в стейт. */
  contextRef?: string | null;
}

/**
 * Обычный клик по снапшоту (единое поведение списков): трек/видео —
 * сразу в плеер, сущность с деталкой (album/artist/playlist) — на
 * экран деталей.
 */
export function openSnapshot(router: Router, snapshot: AnySnapshot | null | undefined, play?: OpenPlayOptions) {
  if (!snapshot) return;
  if (snapshot.type === 'track' || snapshot.type === 'video') {
    // Тап по строке: текущий снапшот — пауза/плей, иной — прямой запуск.
    void usePlayerStore().playOrToggle(snapshot, play?.playbackSource ?? PLAY_SOURCE_SINGLE, {
      contextItems: play?.contextItems,
      contextRef: play?.contextRef,
    });
    return;
  }
  const paths = { album: '/album', artist: '/artist', playlist: '/playlist' } as const;
  void router.push(`${paths[snapshot.type]}/${snapshot.source_type}/${snapshot.source_id}`);
}
