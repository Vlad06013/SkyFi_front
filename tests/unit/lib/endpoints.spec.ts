import { describe, expect, it } from 'vitest';
import { chooseRoute, isLocalForce, selectEndpoint } from '@/lib/endpoints';

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
