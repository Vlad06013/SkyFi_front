import { describe, expect, it } from 'vitest';
import { isOwnApiStream } from '@/lib/own-stream';

const api = new URL(import.meta.env.VITE_API_URL);
const prefix = api.pathname.replace(/\/$/, '');

describe('own-stream', () => {
  it('поток своей загрузки — наш API, чужой CDN — нет', () => {
    expect(isOwnApiStream(`${api.origin}${prefix}/uploads/1/stream`)).toBe(true);
    expect(isOwnApiStream('https://cdn.example/track.mp3')).toBe(false);
  });

  it('путь вне API-префикса на нашем хосте — не свой поток', () => {
    expect(isOwnApiStream(`${api.origin}/yt-resource/video/1/stream`)).toBe(false);
  });

  it('относительная ссылка без хоста — не абсолютный URL, не свой', () => {
    expect(isOwnApiStream(`${prefix}/uploads/1/stream`)).toBe(false);
  });

  it('dev-прокси: свой поток с origin dev-сервера тоже наш', () => {
    expect(isOwnApiStream(`${window.location.origin}${prefix}/uploads/1/stream`)).toBe(true);
  });
});
