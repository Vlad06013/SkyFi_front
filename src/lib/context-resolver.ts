import { fetchEntityDetails } from '@/api/details';
import { getActivePinia } from 'pinia';
import { useDownloadsStore } from '@/stores/downloads';
import { fetchFavorites } from '@/api/favorites';
import { fetchSearch } from '@/api/search';
import { fetchUploads } from '@/api/uploads';
import { fetchWaveWindow } from '@/api/wave';
import { snapshotKey } from '@/lib/playback-engine';
import type { AnySnapshot, PlaySource, SnapshotSource, SnapshotType } from '@/types';

/**
 * Resolver контекста воспроизведения (plan-player.md §2/§7): по паре
 * `play_source` + `context_ref` из серверного стейта каждое устройство
 * само материализует список обычными API (они идемпотентны). Содержимое
 * по сокетам не гоняем — только указатель. Пульт без resolver не строит
 * переходы: next/prev считаются движком по материализованному списку.
 */

/** Размер страницы пагинированных источников (поиск/плейлист). */
export const CONTEXT_PAGE_LIMIT = 50;

/** Страховка от бесконечной догрузки: больше страниц за один резолв не тянем. */
export const MAX_CONTEXT_PAGES = 10;

/** Страница контекста: элементы в порядке следования + есть ли продолжение. */
export interface ContextPage {
  items: AnySnapshot[];
  hasMore: boolean;
}

export interface ContextRequest {
  playSource: PlaySource;
  contextRef: string | null;
  /** Тип текущего снапшота: для search выбирает секцию (треки/видео). */
  currentType: SnapshotType | null;
}

/** Результат полного резолва: загруженные страницы и остаток за краем. */
export interface ResolvedContext {
  items: AnySnapshot[];
  /** Сколько страниц загружено. */
  pages: number;
  /** Есть ли ещё страницы за пределами загруженного. */
  hasMore: boolean;
}

/**
 * Opaque context_ref плейлиста (plan-player.md §2): «source_type:source_id».
 * Составной: пульту для `/details` нужна пара источника, одного id мало.
 * source_type из enum без двоеточия — парсим по первому разделителю.
 */
export function playlistContextRef(sourceType: SnapshotSource, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

/** Разбор playlist-context_ref; null — битый формат. */
export function parsePlaylistContextRef(ref: string | null): { sourceType: SnapshotSource; sourceId: string } | null {
  if (!ref) return null;
  const sep = ref.indexOf(':');
  if (sep <= 0 || sep === ref.length - 1) return null;
  return { sourceType: ref.slice(0, sep) as SnapshotSource, sourceId: ref.slice(sep + 1) };
}

/**
 * Одна страница контекста (page с 1). null — источник по ref не
 * резолвится (single/queue — локальные контексты) или ref битый.
 * Продолжение: у search «страница непустая» (как в Search.ts —
 * backend шлёт has_more: false), у details — has_more или полная страница.
 */
export async function fetchContextPage(req: ContextRequest, page: number): Promise<ContextPage | null> {
  switch (req.playSource) {
    case 'favorites': {
      if (page > 1) return { items: [], hasMore: false };
      const payload = await fetchFavorites();
      return { items: payload.tracks, hasMore: false };
    }
    case 'uploads': {
      if (page > 1) return { items: [], hasMore: false };
      const items = await fetchUploads();
      return { items, hasMore: false };
    }
    case 'wave': {
      if (page > 1) return { items: [], hasMore: false };
      const items = await fetchWaveWindow();
      return { items, hasMore: false };
    }
    case 'search': {
      if (!req.contextRef) return { items: [], hasMore: false };
      const payload = await fetchSearch({ q: req.contextRef, limit: CONTEXT_PAGE_LIMIT, page });
      const section = req.currentType === 'video' ? payload.videos : payload.tracks;
      return { items: section.items, hasMore: section.items.length > 0 };
    }
    case 'playlist': {
      const ref = parsePlaylistContextRef(req.contextRef);
      if (!ref) return null;
      if (getActivePinia()) {
        const saved = useDownloadsStore().savedCollectionOf('playlist', ref.sourceType, ref.sourceId);
        if (saved?.complete) return { items: page === 1 ? saved.tracks : [], hasMore: false };
      }
      const payload = await fetchEntityDetails(
        { type: 'playlist', source_type: ref.sourceType, source_id: ref.sourceId },
        { page, limit: CONTEXT_PAGE_LIMIT },
      );
      return {
        items: payload.tracks.items,
        hasMore: payload.tracks.has_more || payload.tracks.items.length >= CONTEXT_PAGE_LIMIT,
      };
    }
    default:
      return null;
  }
}

/**
 * Полный резолв: грузит страницы, пока current не окажется в списке
 * или лист не кончится. current не найден (протух/убран с другого
 * устройства) — весь загруженный список: движок возьмёт начало
 * (fallback plan-player.md §2). hasMore остаётся на краю загруженного —
 * движок догружает следующую страницу, когда next упирается в край.
 */
export async function resolveContext(req: ContextRequest, current: AnySnapshot | null): Promise<ResolvedContext> {
  const items: AnySnapshot[] = [];
  const key = current ? snapshotKey(current) : null;
  let pages = 0;
  let hasMore = false;
  for (let page = 1; page <= MAX_CONTEXT_PAGES; page++) {
    const result = await fetchContextPage(req, page);
    pages = page;
    if (!result) return { items, pages, hasMore: false };
    items.push(...result.items);
    hasMore = result.hasMore;
    if (!hasMore) break;
    if (key && items.some((item) => snapshotKey(item) === key)) break;
  }
  return { items, pages, hasMore };
}
