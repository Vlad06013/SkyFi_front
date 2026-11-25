import type { CollectionRecord, LinkRecord, TrackRecord } from '@/lib/download-db';
import type { TrackSnapshot } from '@/types';
import type { CollectionSnapshot } from '@/lib/download-keys';

export interface SavedCollection {
  snapshot: CollectionSnapshot;
  tracks: TrackSnapshot[];
  complete: boolean;
}

function plannedKeys(row: CollectionRecord, links: LinkRecord[]): string[] {
  if (row.trackKeys?.length) return row.trackKeys;
  return links.filter((link) => link.ownerKey === row.key).map((link) => link.trackKey);
}

/** Альбом или плейлист из базы: порядок треков и признак, что файлы на месте все. */
export function savedCollection(
  row: CollectionRecord | undefined,
  tracks: TrackRecord[],
  links: LinkRecord[],
): SavedCollection | null {
  if (!row || (row.snapshot.type !== 'album' && row.snapshot.type !== 'playlist')) return null;
  const order = plannedKeys(row, links);
  const total = row.total > 0 ? row.total : order.length;
  const byKey = new Map(tracks.map((track) => [track.key, track.snapshot]));
  const items = order
    .map((key) => byKey.get(key))
    .filter((track): track is TrackSnapshot => Boolean(track));
  const complete = total > 0 && order.length >= total && order.every((key) => byKey.has(key));
  return { snapshot: row.snapshot, tracks: items, complete };
}

/**
 * Процент неполного альбома или плейлиста.
 * null — записи нет или скачано всё (на строке галочка, не кольцо).
 */
export function collectionPercent(
  row: CollectionRecord | undefined,
  tracks: TrackRecord[],
  links: LinkRecord[],
  filePct: Record<string, number>,
): number | null {
  const saved = savedCollection(row, tracks, links);
  if (!saved || saved.complete || !row || row.total <= 0) return null;
  const order = plannedKeys(row, links);
  const have = new Set(tracks.map((track) => track.key));
  const done = order.filter((key) => have.has(key)).length;
  let fraction = done;
  for (const key of order) {
    if (have.has(key)) continue;
    const pct = filePct[key];
    if (pct === undefined) continue;
    fraction += pct / 100;
    break;
  }
  if (fraction <= 0) return 0;
  return Math.min(99, Math.max(1, Math.round((fraction / row.total) * 100)));
}
