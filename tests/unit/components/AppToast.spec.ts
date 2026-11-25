import { describe, expect, it } from 'vitest';
import { toastSwipe } from '@/components/AppToast/AppToast';

describe('toast swipe', () => {
  it('короткий и вертикальный жест тост не снимает', () => {
    expect(toastSwipe(20, 0)).toBe('stay');
    expect(toastSwipe(40, 80)).toBe('stay');
  });

  it('сдвиг в сторону дальше порога снимает', () => {
    expect(toastSwipe(80, 10)).toBe('dismiss');
    expect(toastSwipe(-90, 12)).toBe('dismiss');
  });
});
