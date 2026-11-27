import { describe, expect, it } from 'vitest';
import { artistsLine } from '@/lib/cover';
import { buildMenuItems, entityFromSnapshot } from '@/lib/media-menu';
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

describe('lib/media-menu — офлайн-гейт', () => {
  const entity = { title: 'Т', artist: 'А', source: 'yandex_music', sourceId: 't1' };

  it('онлайн: без disabled-флагов', () => {
    const items = buildMenuItems('my-tracks', entity, { liked: false, downloaded: false }, false);
    expect(items.every((item) => !item.disabled)).toBe(true);
  });

  it('офлайн: активны только лайк на избранном и удаление скачанного', () => {
    const state = { liked: true, downloaded: true };
    const items = buildMenuItems('my-tracks', entity, state, true);
    const active = items.filter((item) => !item.disabled).map((item) => item.id);
    expect(active).toEqual(['like', 'download']);
  });

  it('офлайн: не-лайкнутое сердечко и «скачать» выключены', () => {
    const items = buildMenuItems('my-tracks', entity, { liked: false, downloaded: false }, true);
    const like = items.find((item) => item.id === 'like');
    const download = items.find((item) => item.id === 'download');
    const queue = items.find((item) => item.id === 'queue');
    expect(like?.disabled).toBe(true);
    expect(download?.disabled).toBe(true);
    expect(queue?.disabled).toBe(true);
  });
});
