import { describe, expect, it } from 'vitest';
import { routeBackTarget } from '@/lib/hardware-back';

describe('routeBackTarget', () => {
  it('альбом с историей — шаг назад', () => {
    expect(routeBackTarget('album', '/library')).toBe('back');
  });

  it('вкладка без истории — на главную', () => {
    expect(routeBackTarget('library', null)).toBe('home');
  });

  it('главная и логин — корень для выхода', () => {
    expect(routeBackTarget('home', null)).toBe('exit-root');
    expect(routeBackTarget('login', '/home')).toBe('exit-root');
  });

  it('назад на логин не откатываем', () => {
    expect(routeBackTarget('settings', '/login')).toBe('home');
  });
});