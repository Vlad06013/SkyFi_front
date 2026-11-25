import { describe, expect, it } from 'vitest';
import { isPlayerWakeKey } from '@/components/NowPlaying/NowPlaying';

describe('простой развёрнутого плеера', () => {
  it('стрелки и ок будят плеер', () => {
    expect(isPlayerWakeKey({ key: 'ArrowLeft' })).toBe(true);
    expect(isPlayerWakeKey({ key: 'ArrowUp' })).toBe(true);
    expect(isPlayerWakeKey({ key: 'Enter' })).toBe(true);
    expect(isPlayerWakeKey({ key: 'Unidentified', keyCode: 23 })).toBe(true);
  });

  it('назад и медиаклавиши простой не перехватывает', () => {
    expect(isPlayerWakeKey({ key: 'Escape' })).toBe(false);
    expect(isPlayerWakeKey({ key: 'MediaPlayPause' })).toBe(false);
    expect(isPlayerWakeKey({ key: 'GoBack', keyCode: 4 })).toBe(false);
  });
});
