import { describe, expect, it } from 'vitest';
import { currentEndpoint } from '@/lib/endpoints';
import { alignOwnStreamUrl, isOwnApiStream } from '@/lib/own-stream';

const upload = 'http://192.168.8.33:8080/api/v1/skyfy/uploads/1/stream';

describe('own-stream', () => {
  it('поток своей загрузки — наш API, чужой CDN — нет', () => {
    expect(isOwnApiStream(upload)).toBe(true);
    expect(isOwnApiStream('https://cdn.example/track.mp3')).toBe(false);
  });

  it('хост ссылки становится текущим адресом API, путь сохраняется', () => {
    const aligned = new URL(alignOwnStreamUrl(upload));
    expect(aligned.host).toBe(new URL(currentEndpoint().apiUrl).host);
    expect(aligned.pathname).toBe('/api/v1/skyfy/uploads/1/stream');
    expect(alignOwnStreamUrl('https://cdn.example/track.mp3')).toBe('https://cdn.example/track.mp3');
  });
});