import { describe, expect, it } from 'vitest';
import { coverSize } from '@/lib/cover';

describe('lib/cover: coverSize', () => {
  it('переписывает размер яндекс-обложки под контекст', () => {
    const url = 'https://avatars.yandex.net/get-music-content/42108/4e50e6dc.p.6964/200x200';
    expect(coverSize(url, 600)).toBe(
      'https://avatars.yandex.net/get-music-content/42108/4e50e6dc.p.6964/600x600',
    );
    expect(coverSize(url, 1000)).toBe(
      'https://avatars.yandex.net/get-music-content/42108/4e50e6dc.p.6964/1000x1000',
    );
  });

  it('принимает orig и mds-хост', () => {
    expect(coverSize('https://avatars.mds.yandex.net/get-music-content/1/abc/orig', 400)).toBe(
      'https://avatars.mds.yandex.net/get-music-content/1/abc/400x400',
    );
  });

  it('чужие URL и нестандартные пути не трогает', () => {
    expect(coverSize('https://avatars.dzeninfra.ru/get-zen_doc/271828/pub_x/orig', 600)).toBe(
      'https://avatars.dzeninfra.ru/get-zen_doc/271828/pub_x/orig',
    );
    expect(coverSize('https://avatars.yandex.net/get-music-content/42108/hash', 600)).toBe(
      'https://avatars.yandex.net/get-music-content/42108/hash',
    );
    expect(coverSize('', 600)).toBe('');
    expect(coverSize('not-a-url', 600)).toBe('not-a-url');
  });
});
