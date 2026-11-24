import { describe, expect, it, vi } from 'vitest';
import { mapAudioTracks, pickLevelIndex, resolveAudioTrackId } from '@/lib/hls-engine';

vi.mock('hls.js', () => {
  class FakeHls {
    static instances = 0;
    /** Последний инстанс, аттачнутый к видео (attachMedia). */
    static attached: unknown = null;
    static Events = {
      ERROR: 'error',
      MANIFEST_PARSED: 'manifestParsed',
      AUDIO_TRACKS_UPDATED: 'audioTracksUpdated',
    };
    static isSupported() {
      return true;
    }
    levels: unknown[] = [];
    audioTracks: unknown[] = [];
    constructor() {
      FakeHls.instances += 1;
    }
    on() {}
    attachMedia() {
      FakeHls.attached = this;
    }
    detachMedia() {}
    loadSource() {}
    startLoad() {}
  }
  return { default: FakeHls };
});

describe('lib/hls-engine: pickLevelIndex', () => {
  // hls.levels отсортированы по высоте (по возрастанию).
  const levels = [{ height: 144 }, { height: 252 }, { height: 360 }, { height: 720 }, { height: 1080 }];

  it('берёт максимальный уровень не выше запрошенного', () => {
    expect(pickLevelIndex(levels, 720)).toBe(3);
    expect(pickLevelIndex(levels, 500)).toBe(2);
  });

  it('точное совпадение высоты', () => {
    expect(pickLevelIndex(levels, 360)).toBe(2);
  });

  it('запрошено выше всех — верхний уровень', () => {
    expect(pickLevelIndex(levels, 2160)).toBe(4);
  });

  it('запрошено ниже всех — нижний уровень', () => {
    expect(pickLevelIndex(levels, 90)).toBe(0);
  });
});

describe('lib/hls-engine: mapAudioTracks', () => {
  it('мапит поля и склеивает дубли «Default» разных групп (YouTube)', () => {
    const tracks = mapAudioTracks([
      { id: 0, name: 'Default', lang: undefined, default: true },
      { id: 1, name: 'Default', lang: undefined, default: true },
    ]);
    expect(tracks).toEqual([{ id: '0', label: 'Default', lang: '', default: true }]);
  });

  it('разные озвучки остаются разными пунктами', () => {
    const tracks = mapAudioTracks([
      { id: 0, name: 'English', lang: 'en', default: true },
      { id: 1, name: 'Русский', lang: 'ru', default: false },
    ]);
    expect(tracks.map((track) => track.label)).toEqual(['English', 'Русский']);
  });

  it('без NAME подставляет lang, без всего — номер дорожки', () => {
    const tracks = mapAudioTracks([
      { id: 0, name: '', lang: 'de', default: false },
      { id: 1, name: '', lang: undefined, default: false },
    ]);
    expect(tracks.map((track) => track.label)).toEqual(['de', 'Дорожка 2']);
  });
});

describe('lib/hls-engine: resolveAudioTrackId', () => {
  const tracks = [
    { id: '0', label: 'English', lang: 'en', default: true },
    { id: '1', label: 'Русский', lang: 'ru', default: false },
  ];

  it('желаемая дорожка жива — берём её', () => {
    expect(resolveAudioTrackId(tracks, '1')).toBe('1');
  });

  it('желаемая пропала из манифеста — default', () => {
    expect(resolveAudioTrackId(tracks, '7')).toBe('0');
  });

  it('без выбора — default из манифеста', () => {
    expect(resolveAudioTrackId(tracks, null)).toBe('0');
  });

  it('default нет — null (выбор hls.js)', () => {
    const noDefault = tracks.map((track) => ({ ...track, default: false }));
    expect(resolveAudioTrackId(noDefault, null)).toBeNull();
  });
});

describe('lib/hls-engine: ensureHls singleton', () => {
  // Регрессия: параллельные hlsLoad (applyHls зовётся из loadVideo и из
  // вотчера clipStreams) до резолва import создавали два инстанса — второй
  // перезаписывал singleton, не будучи аттачнутым, и качество/дорожки
  // уходили в пустышку (levels пуст): переключение качества молча умирало.
  it('параллельные hlsLoad делят один инстанс hls.js', async () => {
    const { hlsLoad, hlsDetach } = await import('@/lib/hls-engine');
    const { default: HlsCtor } = await import('hls.js');
    const fake = HlsCtor as unknown as { instances: number; attached: unknown };
    const el = document.createElement('video');
    const [first, second] = await Promise.all([
      hlsLoad(el, 'http://test/manifest.m3u8'),
      hlsLoad(el, 'http://test/manifest.m3u8'),
    ]);
    expect(fake.instances).toBe(1);
    // Singleton (window.__hls в DEV) — тот же инстанс, что аттачнут к видео.
    // NB: при старом коде vitest на конкурентных import подсовывал разные
    // модули, и счётчик инстансов гонку не видел — поэтому проверка по
    // идентичности «singleton === attached», она ловит её при любом раскладе.
    expect((window as unknown as { __hls: unknown }).__hls).toBe(fake.attached);
    expect(first).toBe(true);
    expect(second).toBe(false);
    hlsDetach();
  });
});
