import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cacheClipResolve,
  clearClipResolveCache,
  getCachedClipResolve,
  invalidateClipResolve,
} from '@/lib/clip-resolve-cache';
import type { TrackSnapshot, VideoSnapshot } from '@/types';

const track: TrackSnapshot = {
  type: 'track',
  source_type: 'yandex_music',
  source_id: 't1',
  title: 'радиотишина',
  artists: [{ name: 'завтра' }],
  duration_ms: 200000,
  cover_url: null,
  album: null,
  stream_url: null,
};

const clip: VideoSnapshot = {
  type: 'video',
  source_type: 'youtube',
  source_id: 'v1',
  title: 'радиотишина (клип)',
  artists: [{ name: 'завтра' }],
  duration_ms: 150000,
  cover_url: null,
  watch_url: null,
};

describe('lib/clip-resolve-cache', () => {
  beforeEach(() => {
    clearClipResolveCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('пустой кеш — undefined (не путать с «клипа нет»)', () => {
    expect(getCachedClipResolve(track)).toBeUndefined();
  });

  it('попадание возвращает видео и потоки', () => {
    cacheClipResolve(track, clip, [{ quality: 720, url: '/yt-resource/video/v1/stream?itag=22' }]);

    const hit = getCachedClipResolve(track);
    expect(hit?.video?.source_id).toBe('v1');
    expect(hit?.streams).toHaveLength(1);
  });

  it('промах (клипа нет) кешируется и живёт ограниченно', () => {
    cacheClipResolve(track, null, []);
    expect(getCachedClipResolve(track)).toEqual({ video: null, streams: [] });

    vi.advanceTimersByTime(16 * 60_000);
    expect(getCachedClipResolve(track)).toBeUndefined();
  });

  it('попадание не протухает по TTL промаха', () => {
    cacheClipResolve(track, clip, []);
    vi.advanceTimersByTime(60 * 60_000);

    expect(getCachedClipResolve(track)?.video?.source_id).toBe('v1');
  });

  it('инвалидация (ручной выбор видео) — следующий резолв в сеть', () => {
    cacheClipResolve(track, clip, []);
    invalidateClipResolve(track);

    expect(getCachedClipResolve(track)).toBeUndefined();
  });
});
