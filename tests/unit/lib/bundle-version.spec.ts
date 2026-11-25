import { describe, expect, it } from 'vitest';
import { shellSemver } from '@/lib/bundle-version';

describe('shellSemver', () => {
  it('дополняет versionName до трёх чисел', () => {
    expect(shellSemver('1.0')).toBe('1.0.0');
    expect(shellSemver('2.4.1')).toBe('2.4.1');
    expect(shellSemver('')).toBe('0.0.0');
  });
});
