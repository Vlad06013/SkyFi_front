import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearHealthLog,
  collectHealthActivity,
  formatHealthLog,
  healthLog,
  recordHealth,
  registerHealthActivity,
  type HealthLogEntry,
} from '@/lib/health-log';

function entry(over: Partial<HealthLogEntry> = {}): HealthLogEntry {
  return {
    at: new Date(2026, 10, 26, 17, 2, 11).getTime(),
    ok: true,
    durationMs: 400,
    miss: null,
    detail: '',
    activity: '',
    transition: null,
    ...over,
  };
}

describe('lib/health-log', () => {
  beforeEach(() => {
    clearHealthLog();
  });

  it('recordHealth копит записи, кольцо ограничено сотней', () => {
    for (let index = 0; index < 105; index += 1) recordHealth(entry({ durationMs: index }));
    expect(healthLog.value).toHaveLength(100);
    expect(healthLog.value[0].durationMs).toBe(5);
    clearHealthLog();
    expect(healthLog.value).toHaveLength(0);
  });

  it('formatHealthLog: промах с типом, переходом и активностью', () => {
    const text = formatHealthLog([
      entry(),
      entry({
        ok: false,
        miss: 'timeout',
        durationMs: 15_000,
        transition: 'offline',
        detail: 'timeout of 15000ms exceeded',
        activity: 'файл 45%',
      }),
    ]);
    const lines = text.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('26.11 17:02:11');
    expect(lines[0]).toContain('ок');
    expect(lines[1]).toContain('ТАЙМАУТ');
    expect(lines[1]).toContain('15.0с');
    expect(lines[1]).toContain('→ ОФЛАЙН');
    expect(lines[1]).toContain('timeout of 15000ms exceeded · файл 45%');
  });

  it('collectHealthActivity собирает строки проб и переживает падение пробы', () => {
    registerHealthActivity('t-ok', () => 'играет');
    registerHealthActivity('t-null', () => null);
    registerHealthActivity('t-boom', () => {
      throw new Error('boom');
    });
    expect(collectHealthActivity()).toBe('играет');
  });
});
