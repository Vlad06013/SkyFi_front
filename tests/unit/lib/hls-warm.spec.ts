import { describe, expect, it } from 'vitest';
import { isUnmeteredConnection, parseMasterPlaylist, parseMediaPlaylistStart, pickVariant } from '@/lib/hls-warm';

const MASTER = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="group/1",NAME="Default",DEFAULT=YES,URI="/yt-resource/hls-seg?u=audio"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="group/2",NAME="Дубляж",DEFAULT=NO,URI="/yt-resource/hls-seg?u=dub"
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,CODECS="avc1.4d401f,mp4a.40.2",AUDIO="group/1"
/yt-resource/hls-seg?u=v360
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="avc1.64001F,mp4a.40.2",AUDIO="group/1"
/yt-resource/hls-seg?u=v720
#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080
/yt-resource/hls-seg?u=v1080
`;

const MEDIA = `#EXTM3U
#EXT-X-TARGETDURATION:5
#EXT-X-MAP:URI="/yt-resource/hls-seg?u=init"
#EXTINF:5.005,
/yt-resource/hls-seg?u=seg1
#EXTINF:5.005,
/yt-resource/hls-seg?u=seg2
#EXTINF:5.005,
/yt-resource/hls-seg?u=seg3
#EXT-X-ENDLIST
`;

describe('lib/hls-warm: parseMasterPlaylist', () => {
  it('ступени с высотами и битрейтами, URI строкой ниже', () => {
    const master = parseMasterPlaylist(MASTER);
    expect(master.variants).toEqual([
      { height: 360, bandwidth: 500000, uri: '/yt-resource/hls-seg?u=v360' },
      { height: 720, bandwidth: 2500000, uri: '/yt-resource/hls-seg?u=v720' },
      { height: 1080, bandwidth: 8000000, uri: '/yt-resource/hls-seg?u=v1080' },
    ]);
  });

  it('аудиодорожка — дефолтная из EXT-X-MEDIA', () => {
    expect(parseMasterPlaylist(MASTER).audioUri).toBe('/yt-resource/hls-seg?u=audio');
  });

  it('без EXT-X-MEDIA звука нет — null', () => {
    const master = parseMasterPlaylist('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv.m3u8\n');
    expect(master.audioUri).toBeNull();
  });
});

describe('lib/hls-warm: parseMediaPlaylistStart', () => {
  it('init из EXT-X-MAP и первые N сегментов', () => {
    expect(parseMediaPlaylistStart(MEDIA, 2)).toEqual({
      initUri: '/yt-resource/hls-seg?u=init',
      segmentUris: ['/yt-resource/hls-seg?u=seg1', '/yt-resource/hls-seg?u=seg2'],
    });
  });

  it('без EXT-X-MAP init отсутствует', () => {
    const start = parseMediaPlaylistStart('#EXTM3U\n#EXTINF:4,\nseg.ts\n', 1);
    expect(start).toEqual({ initUri: null, segmentUris: ['seg.ts'] });
  });
});

describe('lib/hls-warm: pickVariant', () => {
  const variants = parseMasterPlaylist(MASTER).variants;

  it('точное попадание по высоте', () => {
    expect(pickVariant(variants, 720)?.height).toBe(720);
  });

  it('между ступенями — высшая не выше желаемой', () => {
    expect(pickVariant(variants, 480)?.height).toBe(360);
  });

  it('желаемая выше всех — верхняя ступень', () => {
    expect(pickVariant(variants, 2160)?.height).toBe(1080);
  });

  it('желаемая ниже всех — нижняя ступень', () => {
    expect(pickVariant(variants, 240)?.height).toBe(360);
  });

  it('без высот — по максимальному битрейту', () => {
    const flat = [
      { height: null, bandwidth: 100, uri: 'a' },
      { height: null, bandwidth: 300, uri: 'b' },
    ];
    expect(pickVariant(flat, 720)?.uri).toBe('b');
  });
});

describe('lib/hls-warm: isUnmeteredConnection', () => {
  it('без Network Information API сеть считается обычной', () => {
    expect(isUnmeteredConnection()).toBe(true);
  });
});
