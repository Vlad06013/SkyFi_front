import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => new Map<string, { key: string; entry: { expiresAt: number } }>());

vi.mock('dexie', () => {
  class Table {
    put(row: { key: string; entry: { expiresAt: number } }) {
      rows.set(row.key, row);
      return Promise.resolve();
    }
    delete(key: string) {
      rows.delete(key);
      return Promise.resolve();
    }
    clear() {
      rows.clear();
      return Promise.resolve();
    }
    bulkDelete(keys: string[]) {
      for (const key of keys) rows.delete(key);
      return Promise.resolve();
    }
    toArray() {
      return Promise.resolve([...rows.values()]);
    }
  }
  class Dexie {
    version() {
      return {
        stores: () => {
          this.urls = new Table();
        },
      };
    }
  }
  return { default: Dexie };
});

import {
  cacheAudioUrl,
  cacheVideoStreams,
  clearStreamCache,
  getCachedStream,
  hydrateStreamCache,
  invalidateStream,
} from '@/lib/stream-url-cache';
import type { AnySnapshot } from '@/types';

function track(id: string): AnySnapshot {
  return {
    type: 'track',
    source_type: 'yandex_music',
    source_id: id,
    title: `track ${id}`,
    artists: [{ name: 'Artist' }],
    duration_ms: 180_000,
    cover_url: null,
    album: null,
    stream_url: null,
  };
}

describe('lib/stream-url-cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    clearStreamCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('кладёт и отдаёт свежую запись', () => {
    cacheAudioUrl(track('t1'), 'https://cdn.test/1.mp3', 300);
    const entry = getCachedStream(track('t1'));
    expect(entry?.kind).toBe('audio');
    if (entry?.kind === 'audio') expect(entry.url).toBe('https://cdn.test/1.mp3');
  });

  it('протухшая запись выметается и отдаётся как null', () => {
    cacheAudioUrl(track('t1'), 'https://cdn.test/1.mp3', 300);
    vi.setSystemTime(1_000_000 + 294_000);
    // Запас TTL_SAFETY_MS (5 с): 294 из 300 ещё валидно.
    expect(getCachedStream(track('t1'))).not.toBeNull();
    vi.setSystemTime(1_000_000 + 296_000);
    expect(getCachedStream(track('t1'))).toBeNull();
    // Повторный get — всё ещё null (запись выметена).
    expect(getCachedStream(track('t1'))).toBeNull();
  });

  it('записи разных родов по одному ключу не путаются', () => {
    const snap = track('t1');
    cacheAudioUrl(snap, 'https://cdn.test/1.mp3', 300);
    const audio = getCachedStream(snap);
    expect(audio?.kind).toBe('audio');
    cacheVideoStreams(snap, [{ quality: 720, url: 'https://cdn.test/720.mp4' }], null, 300);
    const video = getCachedStream(snap);
    expect(video?.kind).toBe('video');
    if (video?.kind === 'video') expect(video.streams).toHaveLength(1);
  });

  it('invalidateStream выметает запись — ретрай пойдёт за свежим', () => {
    cacheAudioUrl(track('t1'), 'https://cdn.test/dead.mp3', 300);
    invalidateStream(track('t1'));
    expect(getCachedStream(track('t1'))).toBeNull();
  });

  it('несуществующий ключ — null', () => {
    expect(getCachedStream(track('missing'))).toBeNull();
  });

  it('после загрузки базы свежая ссылка жива, протухшая выметается', async () => {
    rows.set('yandex_music:live', {
      key: 'yandex_music:live',
      entry: { expiresAt: 1_000_000 + 300_000 },
    });
    rows.set('yandex_music:dead', {
      key: 'yandex_music:dead',
      entry: { expiresAt: 1_000_000 },
    });

    await hydrateStreamCache();

    expect(getCachedStream(track('live'))).not.toBeNull();
    expect(getCachedStream(track('dead'))).toBeNull();
    expect(rows.has('yandex_music:dead')).toBe(false);
  });
});
