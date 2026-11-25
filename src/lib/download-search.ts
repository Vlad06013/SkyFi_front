import type { CollectionRecord, LinkRecord, TrackRecord } from '@/lib/download-db';
import type { AlbumSnapshot, PlaylistSnapshot, TrackSnapshot } from '@/types';
import type { CollectionSnapshot } from '@/lib/download-keys';

export interface DownloadSearchHit {
  tracks: TrackSnapshot[];
  albums: AlbumSnapshot[];
  playlists: PlaylistSnapshot[];
  best: TrackSnapshot | AlbumSnapshot | PlaylistSnapshot | null;
}

function fold(value: string): string {
  return value.trim().toLowerCase().replaceAll('ё', 'е');
}

/** Одна строка для поиска: повторы слов выкидываем, порядок сохраняем. */
export function joinSearchQuery(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const word of part.split(/\s+/)) {
      const key = fold(word);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      words.push(word);
    }
  }
  return words.join(' ');
}

/** Трек: исполнители, название, альбом. Собирается при скачивании. */
export function trackSearchQuery(track: TrackSnapshot): string {
  return joinSearchQuery([...track.artists.map((artist) => artist.name), track.title, track.album?.title]);
}

/** Альбом или плейлист: своё название и исполнители, плюс строки вложенных треков. */
export function collectionSearchQuery(snapshot: CollectionSnapshot, trackQueries: string[]): string {
  const own =
    snapshot.type === 'playlist'
      ? [snapshot.title, snapshot.owner_name, ...snapshot.artists.map((artist) => artist.name)]
      : [snapshot.title, ...snapshot.artists.map((artist) => artist.name)];
  return joinSearchQuery([...own, ...trackQueries]);
}

function fieldScore(needle: string, value: string): number {
  const text = fold(value);
  if (!text) return 0;
  if (text === needle) return 100;
  if (text.startsWith(needle)) return 80;
  if (text.includes(needle)) return 60;
  return 0;
}

function readyCollection(row: CollectionRecord, trackKeys: Set<string>, links: LinkRecord[]): boolean {
  if (row.total <= 0) return false;
  const linked = links.filter((link) => link.ownerKey === row.key && trackKeys.has(link.trackKey)).length;
  return linked >= row.total;
}

function storedTrackQuery(row: TrackRecord): string {
  return row.searchQuery || trackSearchQuery(row.snapshot);
}

function storedCollectionQuery(row: CollectionRecord, tracks: TrackRecord[], links: LinkRecord[]): string {
  if (row.searchQuery) return row.searchQuery;
  const nested = links
    .filter((link) => link.ownerKey === row.key)
    .map((link) => tracks.find((track) => track.key === link.trackKey))
    .filter((track): track is TrackRecord => Boolean(track))
    .map((track) => storedTrackQuery(track));
  return collectionSearchQuery(row.snapshot, nested);
}

function byScoreThenTitle<T extends { title: string }>(items: Array<{ item: T; score: number }>): T[] {
  return [...items]
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'ru'))
    .map((entry) => entry.item);
}

/** Поиск по строке, записанной при скачивании. Недоскачанные альбомы и плейлисты не показываем. */
export function searchDownloads(
  query: string,
  tracks: TrackRecord[],
  collections: CollectionRecord[],
  links: LinkRecord[],
): DownloadSearchHit {
  const needle = fold(query);
  const empty: DownloadSearchHit = { tracks: [], albums: [], playlists: [], best: null };
  if (needle.length < 2) return empty;

  const trackKeys = new Set(tracks.map((row) => row.key));
  const scoredTracks = tracks
    .map((row) => ({ item: row.snapshot, score: fieldScore(needle, storedTrackQuery(row)) }))
    .filter((entry) => entry.score > 0);

  const scoredAlbums: Array<{ item: AlbumSnapshot; score: number }> = [];
  const scoredPlaylists: Array<{ item: PlaylistSnapshot; score: number }> = [];
  for (const row of collections) {
    if (!readyCollection(row, trackKeys, links)) continue;
    const score = fieldScore(needle, storedCollectionQuery(row, tracks, links));
    if (score <= 0) continue;
    if (row.snapshot.type === 'album') scoredAlbums.push({ item: row.snapshot, score });
    else if (row.snapshot.type === 'playlist') scoredPlaylists.push({ item: row.snapshot, score });
  }

  const ranked = [
    ...scoredTracks.map((entry) => ({ ...entry, rank: 0 })),
    ...scoredAlbums.map((entry) => ({ ...entry, rank: 1 })),
    ...scoredPlaylists.map((entry) => ({ ...entry, rank: 2 })),
  ].sort((a, b) => b.score - a.score || a.rank - b.rank || a.item.title.localeCompare(b.item.title, 'ru'));

  return {
    tracks: byScoreThenTitle(scoredTracks),
    albums: byScoreThenTitle(scoredAlbums),
    playlists: byScoreThenTitle(scoredPlaylists),
    best: ranked[0]?.item ?? null,
  };
}
