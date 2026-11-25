import { describe, expect, it } from 'vitest';
import { feedbackOnFavorite, feedbackOnLeave, feedbackOnProgress, type WaveListen } from '@/lib/wave-feedback';

function listen(patch: Partial<WaveListen> = {}): WaveListen {
  return { unplayed: true, liked: false, disliked: false, sent: null, heard: true, heardRatio: 0, ...patch };
}

describe('wave feedback', () => {
  it('по прослушанному ничего не шлёт', () => {
    const played = listen({ unplayed: false });
    expect(feedbackOnFavorite(played, true)).toBeNull();
    expect(feedbackOnFavorite(played, false)).toBeNull();
    expect(feedbackOnProgress(played, 0.9)).toBeNull();
    expect(feedbackOnLeave(played, 0.1)).toBeNull();
  });

  it('лайк — сердечко или прогресс больше 70%', () => {
    expect(feedbackOnFavorite(listen(), true)).toBe('like');
    expect(feedbackOnProgress(listen(), 0.7)).toBeNull();
    expect(feedbackOnProgress(listen(), 0.71)).toBe('like');
    expect(feedbackOnLeave(listen(), 0.8)).toBe('like');
  });

  it('скип — дизлайк или уход короче 70%', () => {
    expect(feedbackOnFavorite(listen(), false)).toBe('skip');
    expect(feedbackOnLeave(listen(), 0.69)).toBe('skip');
    expect(feedbackOnLeave(listen({ disliked: true }), 0.9)).toBe('skip');
  });

  it('без реального звука и с порогом уже на старте ничего не шлёт', () => {
    expect(feedbackOnProgress(listen({ heard: false }), 0.9)).toBeNull();
    expect(feedbackOnLeave(listen({ heard: false }), 0.2)).toBeNull();
    expect(feedbackOnProgress(listen({ heardRatio: 0.8 }), 0.9)).toBeNull();
    expect(feedbackOnFavorite(listen({ heard: false }), true)).toBe('like');
  });

  it('уже отправленную реакцию не повторяет', () => {
    expect(feedbackOnLeave(listen({ sent: 'like' }), 0.2)).toBeNull();
    expect(feedbackOnProgress(listen({ sent: 'like' }), 0.9)).toBeNull();
    expect(feedbackOnFavorite(listen({ sent: 'like' }), true)).toBeNull();
    expect(feedbackOnProgress(listen({ disliked: true }), 0.9)).toBeNull();
  });
});
