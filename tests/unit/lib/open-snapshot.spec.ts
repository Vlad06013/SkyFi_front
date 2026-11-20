import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Router } from 'vue-router';
import { openSnapshot } from '@/lib/open-snapshot';
import { usePlayerStore } from '@/stores/player';
import type { AnySnapshot } from '@/types';

const pushMock = vi.fn();
const router = { push: pushMock } as unknown as Router;

const track: AnySnapshot = {
  type: 'track',
  source_type: 'yandex_music',
  source_id: '123',
  title: 'трек',
  artists: [{ name: 'артист' }],
  duration_ms: null,
  cover_url: null,
  album: null,
  stream_url: null,
};

describe('lib/open-snapshot', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('трек → в плеер', () => {
    openSnapshot(router, track);
    expect(usePlayerStore().current?.source_id).toBe('123');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('видео → в плеер', () => {
    const video: AnySnapshot = { ...track, type: 'video' };
    openSnapshot(router, video);
    expect(usePlayerStore().current?.type).toBe('video');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('альбом → деталка', () => {
    const album: AnySnapshot = { ...track, type: 'album' };
    openSnapshot(router, album);
    expect(pushMock).toHaveBeenCalledWith('/album/yandex_music/123');
  });

  it('плейлист → деталка', () => {
    const playlist: AnySnapshot = { ...track, type: 'playlist' };
    openSnapshot(router, playlist);
    expect(pushMock).toHaveBeenCalledWith('/playlist/yandex_music/123');
  });

  it('null — ничего', () => {
    openSnapshot(router, null);
    expect(pushMock).not.toHaveBeenCalled();
    expect(usePlayerStore().current?.source_id).not.toBe('123');
  });
});
