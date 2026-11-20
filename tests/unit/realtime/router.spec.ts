import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isOwnEcho, markCommand, createRouter, resetSeenCommands, type EventChannel } from '@/realtime/router';

function fakeChannel() {
  const handlers = new Map<string, (payload: unknown) => void>();
  const channel: EventChannel = {
    listen: (event, callback) => {
      handlers.set(event, callback);
    },
  };
  return { channel, emit: (event: string, payload: unknown) => handlers.get(event)?.(payload) };
}

beforeEach(() => {
  resetSeenCommands();
});

describe('realtime/router: эхо-глушение', () => {
  it('своё эхо (origin = мой id) пропускается', () => {
    const { channel, emit } = fakeChannel();
    const handler = vi.fn();
    const router = createRouter({ getMyOriginIds: () => [7] });
    router.listen(channel, '.test', { echo: true }, handler);

    emit('.test', { origin_device_id: 7, command_id: 'c1' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('своё эхо по uuid (connected несёт uuid, провод 2026-11-20) пропускается', () => {
    const { channel, emit } = fakeChannel();
    const handler = vi.fn();
    const router = createRouter({ getMyOriginIds: () => [7, 'uuid-1'] });
    router.listen(channel, '.test', { echo: true }, handler);

    emit('.test', { origin_device_id: 'uuid-1' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('чужое устройство применяется', () => {
    const { channel, emit } = fakeChannel();
    const handler = vi.fn();
    const router = createRouter({ getMyOriginIds: () => [7] });
    router.listen(channel, '.test', { echo: true }, handler);

    emit('.test', { origin_device_id: 9, command_id: 'c1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('мои id ещё неизвестны — применяем (не глушим вслепую)', () => {
    const { channel, emit } = fakeChannel();
    const handler = vi.fn();
    const router = createRouter({ getMyOriginIds: () => [] });
    router.listen(channel, '.test', { echo: true }, handler);

    emit('.test', { origin_device_id: 7 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('origin отсутствует — применяем', () => {
    const { channel, emit } = fakeChannel();
    const handler = vi.fn();
    const router = createRouter({ getMyOriginIds: () => [7] });
    router.listen(channel, '.test', { echo: true }, handler);

    emit('.test', {});
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('realtime/router: дедуп по command_id', () => {
  it('повторная доставка с тем же command_id игнорируется', () => {
    const { channel, emit } = fakeChannel();
    const handler = vi.fn();
    const router = createRouter({ getMyOriginIds: () => [] });
    router.listen(channel, '.test', { dedup: true }, handler);

    emit('.test', { command_id: 'cmd-1' });
    emit('.test', { command_id: 'cmd-1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('без command_id дедуп не работает', () => {
    const { channel, emit } = fakeChannel();
    const handler = vi.fn();
    const router = createRouter({ getMyOriginIds: () => [] });
    router.listen(channel, '.test', { dedup: true }, handler);

    emit('.test', {});
    emit('.test', {});
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('realtime/router: чистые функции', () => {
  it('isOwnEcho', () => {
    expect(isOwnEcho(7, [7])).toBe(true);
    expect(isOwnEcho('uuid-1', [7, 'uuid-1'])).toBe(true);
    expect(isOwnEcho('7', [7])).toBe(false);
    expect(isOwnEcho(8, [7])).toBe(false);
    expect(isOwnEcho(null, [7])).toBe(false);
    expect(isOwnEcho(7, [])).toBe(false);
  });

  it('markCommand: первый раз false, повтор true, null не дедуплицирует', () => {
    expect(markCommand('a')).toBe(false);
    expect(markCommand('a')).toBe(true);
    expect(markCommand(null)).toBe(false);
    expect(markCommand(undefined)).toBe(false);
  });
});
