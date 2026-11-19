import { describe, expect, it } from 'vitest';
import { artistsLine } from '@/lib/cover';
import { entityFromSnapshot } from '@/lib/media-menu';
import type { ArtistSnapshot } from '@/types';

describe('lib/media-menu — entityFromSnapshot', () => {
  it('артист без поля artists (форма с провода) не падает, artist = title', () => {
    const artist = {
      type: 'artist',
      source_type: 'yandex_music',
      source_id: '6964',
      title: 'Five Finger Death Punch',
      cover_url: null,
    } as unknown as ArtistSnapshot;
    const entity = entityFromSnapshot(artist);
    expect(entity.title).toBe('Five Finger Death Punch');
    expect(entity.artist).toBe('Five Finger Death Punch');
    expect(entity.sourceId).toBe('6964');
  });
});

describe('lib/cover — artistsLine', () => {
  it('переваривает отсутствующий artists', () => {
    expect(artistsLine(undefined)).toBe('');
    expect(artistsLine(null)).toBe('');
    expect(artistsLine([{ name: 'А' }, { name: 'Б' }])).toBe('А, Б');
  });
});
