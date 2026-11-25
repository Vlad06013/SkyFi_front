import { describe, expect, it } from 'vitest';
import type { CollectionRecord, TrackRecord } from '@/lib/download-db';
import { searchDownloads, trackSearchQuery } from '@/lib/download-search';
import type { AlbumSnapshot, PlaylistSnapshot, TrackSnapshot } from '@/types';

function track(id: string, title: string, artist: string, album: string): TrackSnapshot {
  return {
    type: 'track',
    source_type: 'yandex_music',
    source_id: id,
    title,
    artists: [{ name: artist }],
    duration_ms: null,
    cover_url: null,
    album: { title: album },
    stream_url: null,
  };
}

function row(snapshot: TrackSnapshot): TrackRecord {
  return {
    key: `track:yandex_music:${snapshot.source_id}`,
    snapshot,
    path: snapshot.source_id,
    bytes: 1,
    coverPath: null,
    coverMime: null,
    downloadedAt: 1,
    searchQuery: trackSearchQuery(snapshot),
  };
}

const fatLip = track('1', 'Fat Lip', 'Sum 41', 'All Killer');
const still = track('2', 'Still Waiting', 'Sum 41', 'Does This Look');

function album(title: string): AlbumSnapshot {
  return {
    type: 'album',
    source_type: 'yandex_music',
    source_id: 'al',
    title,
    artists: [{ name: 'Sum 41' }],
    year: '2001',
    cover_url: null,
    track_count: 2,
  };
}

function playlist(): PlaylistSnapshot {
  return {
    type: 'playlist',
    source_type: 'yandex_music',
    source_id: 'pl',
    title: 'Дорога',
    artists: [],
    owner_name: 'Влад',
    cover_url: null,
    item_count: 2,
  };
}

describe('searchDownloads', () => {
  const tracks = [row(fatLip), row(still)];
  const albumRow: CollectionRecord = {
    key: 'album:yandex_music:al',
    snapshot: album('All Killer'),
    total: 2,
    coverPath: null,
    coverMime: null,
    searchQuery: 'All Killer Sum 41 Fat Lip Still Waiting Does This Look',
  };
  const playlistRow: CollectionRecord = {
    key: 'playlist:yandex_music:pl',
    snapshot: playlist(),
    total: 2,
    coverPath: null,
    coverMime: null,
    searchQuery: 'Дорога Влад Sum 41 Fat Lip Still Waiting',
  };
  const links = [
    { id: 'a', trackKey: tracks[0].key, ownerKey: albumRow.key },
    { id: 'b', trackKey: tracks[1].key, ownerKey: albumRow.key },
    { id: 'c', trackKey: tracks[0].key, ownerKey: playlistRow.key },
    { id: 'd', trackKey: tracks[1].key, ownerKey: playlistRow.key },
  ];

  it('по исполнителю находит треки, альбом и плейлист', () => {
    const found = searchDownloads('sum 41', tracks, [albumRow, playlistRow], links);
    expect(found.tracks.map((item) => item.source_id)).toEqual(['1', '2']);
    expect(found.albums.map((item) => item.title)).toEqual(['All Killer']);
    expect(found.playlists.map((item) => item.title)).toEqual(['Дорога']);
  });

  it('по названию трека находит альбом и плейлист, куда он скачан', () => {
    const found = searchDownloads('fat lip', tracks, [albumRow, playlistRow], links);
    expect(found.tracks).toHaveLength(1);
    expect(found.albums).toHaveLength(1);
    expect(found.playlists).toHaveLength(1);
    expect(found.best?.type).toBe('track');
  });

  it('недоскачанный альбом не попадает в выдачу', () => {
    const found = searchDownloads('all killer', tracks, [{ ...albumRow, total: 3 }], links);
    expect(found.albums).toHaveLength(0);
    expect(found.tracks.map((item) => item.title)).toEqual(['Fat Lip']);
  });
});
