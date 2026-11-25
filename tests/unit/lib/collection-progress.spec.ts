import { describe, expect, it } from 'vitest';
import { collectionPercent, savedCollection } from '@/lib/collection-progress';
import type { CollectionRecord, TrackRecord } from '@/lib/download-db';
import type { AlbumSnapshot, TrackSnapshot } from '@/types';

function track(id: string): TrackSnapshot {
  return {
    type: 'track',
    source_type: 'yandex_music',
    source_id: id,
    title: id,
    artists: [],
    duration_ms: null,
    cover_url: null,
    album: null,
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
  };
}

const album: AlbumSnapshot = {
  type: 'album',
  source_type: 'yandex_music',
  source_id: 'al',
  title: 'Legacy',
  artists: [],
  year: null,
  cover_url: null,
  track_count: 2,
};

function collection(): CollectionRecord {
  return {
    key: 'album:yandex_music:al',
    snapshot: album,
    total: 2,
    trackKeys: ['track:yandex_music:t1', 'track:yandex_music:t2'],
    coverPath: null,
    coverMime: null,
  };
}

describe('collection progress', () => {
  it('неполный альбом отдаёт процент и не считается готовым', () => {
    const saved = savedCollection(collection(), [row(track('t1'))], []);
    expect(saved?.complete).toBe(false);
    expect(saved?.tracks).toHaveLength(1);
    expect(collectionPercent(collection(), [row(track('t1'))], [], {})).toBe(50);
  });

  it('полный альбом готов и без кольца', () => {
    const tracks = [row(track('t1')), row(track('t2'))];
    const saved = savedCollection(collection(), tracks, []);
    expect(saved?.complete).toBe(true);
    expect(saved?.tracks.map((item) => item.source_id)).toEqual(['t1', 't2']);
    expect(collectionPercent(collection(), tracks, [], {})).toBeNull();
  });

  it('текущий файл двигает процент, пока он ещё не записан', () => {
    const pct = collectionPercent(collection(), [], [], { 'track:yandex_music:t1': 40 });
    expect(pct).toBe(20);
  });
});
