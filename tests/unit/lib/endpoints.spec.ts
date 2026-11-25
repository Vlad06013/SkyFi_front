import { describe, expect, it } from 'vitest';
import { chooseRoute } from '@/lib/endpoints';

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
