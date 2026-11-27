import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearNetLog,
  collectNetActivity,
  formatNetLog,
  netLog,
  recordNetEvent,
  registerNetActivity,
  type NetLogEntry,
} from '@/lib/net-log';

function entry(over: Partial<NetLogEntry> = {}): NetLogEntry {
  return {
    at: new Date(2026, 10, 26, 17, 2, 11).getTime(),
    event: 'connect',
    detail: '',
    activity: '',
    transition: null,
    ...over,
  };
}

describe('lib/net-log', () => {
  beforeEach(() => {
    clearNetLog();
  });

  it('recordNetEvent копит записи, кольцо ограничено сотней', () => {
    for (let index = 0; index < 105; index += 1) recordNetEvent('connect');
    expect(netLog.value).toHaveLength(100);
    clearNetLog();
    expect(netLog.value).toHaveLength(0);
  });

  it('formatNetLog: событие с переходом и активностью', () => {
    const text = formatNetLog([
      entry(),
      entry({
        event: 'force-offline',
        detail: 'фейлов подряд: 3',
        transition: 'offline',
        activity: 'файл 45%',
      }),
    ]);
    const lines = text.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('26.11 17:02:11');
    expect(lines[0]).toContain('КОННЕКТ');
    expect(lines[1]).toContain('ОФЛАЙН (ФЕЙЛЫ ЗАПРОСОВ)');
    expect(lines[1]).toContain('→ ОФФЛАЙН');
    expect(lines[1]).toContain('фейлов подряд: 3 · файл 45%');
  });

  it('collectNetActivity собирает строки проб и переживает падение пробы', () => {
    registerNetActivity('t-ok', () => 'играет');
    registerNetActivity('t-null', () => null);
    registerNetActivity('t-boom', () => {
      throw new Error('boom');
    });
    expect(collectNetActivity()).toBe('играет');
  });
});
