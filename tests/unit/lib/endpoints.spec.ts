import { describe, expect, it } from 'vitest';
import { chooseRoute, endpointKind, isLocalForce, resolveUrl, selectEndpoint } from '@/lib/endpoints';

describe('chooseRoute', () => {
  const wan = '91.228.31.47';

  it('внешний IP устройства равен адресу бэка — домашняя пара', () => {
    expect(chooseRoute(wan, wan, true)).toBe('local');
  });

  it('другой внешний IP — внешняя пара', () => {
    expect(chooseRoute('10.1.2.3', wan, true)).toBe('wan');
  });

  it('IP не узнали или локалка недоступна — внешняя пара', () => {
    expect(chooseRoute(null, wan, true)).toBe('wan');
    expect(chooseRoute(wan, wan, false)).toBe('wan');
  });
});

describe('принудительная локалка', () => {
  it('флаг читается только как строка true', () => {
    expect(isLocalForce('true')).toBe(true);
    expect(isLocalForce('false')).toBe(false);
    expect(isLocalForce(undefined)).toBe(false);
  });

  it('true ставит домашнюю пару даже при чужом IP и https-странице', () => {
    expect(
      selectEndpoint({
        force: true,
        hasLocal: true,
        allowed: false,
        ip: '10.1.2.3',
        wanHost: '91.228.31.47',
        current: 'wan',
      }),
    ).toBe('local');
  });

  it('true без домашнего адреса остаётся на внешнем', () => {
    expect(
      selectEndpoint({
        force: true,
        hasLocal: false,
        allowed: false,
        ip: null,
        wanHost: '91.228.31.47',
        current: 'wan',
      }),
    ).toBe('wan');
  });
});

describe('resolveUrl', () => {
  const wanOrigin = new URL(import.meta.env.VITE_API_URL).origin;

  it('относительный путь бэка получает хост активной пары', () => {
    endpointKind.value = 'wan';
    expect(resolveUrl('/yt-resource/cover?u=abc')).toBe(`${wanOrigin}/yt-resource/cover?u=abc`);
    expect(resolveUrl('/storage/avatars/1.png')).toBe(`${wanOrigin}/storage/avatars/1.png`);
  });

  it('смена сети меняет хост резолва', () => {
    endpointKind.value = 'local';
    const localOrigin = new URL(import.meta.env.VITE_API_URL_LOCAL as string).origin;
    expect(resolveUrl('/storage/avatars/1.png')).toBe(`${localOrigin}/storage/avatars/1.png`);
    endpointKind.value = 'wan';
  });

  it('внешние и служебные ссылки проходят без изменений', () => {
    expect(resolveUrl('https://cdn.example/cover.jpg')).toBe('https://cdn.example/cover.jpg');
    expect(resolveUrl('blob:http://app/1')).toBe('blob:http://app/1');
    expect(resolveUrl('//cdn.example/cover.jpg')).toBe('//cdn.example/cover.jpg');
    expect(resolveUrl('')).toBe('');
    expect(resolveUrl(null)).toBe('');
  });
});
