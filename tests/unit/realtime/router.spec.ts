import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isOwnEcho, markCommand, createRouter, resetSeenCommands, type EventChannel } from '@/realtime/router';

const MY_UUID = '9f1c7a2e-4b3d-4c8a-9e5f-2d6b0a1c4f77';

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
  it('своё эхо (origin = мой device_uuid) пропускается', () => {
    const { channel, emit } = fakeChannel();
    const handler = vi.fn();
    const router = createRouter({ getMyOriginIds: () => [MY_UUID] });
    router.listen(channel, '.test', { echo: true }, handler);

    emit('.test', { origin_device_id: MY_UUID, command_id: 'c1' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('чужое устройство применяется', () => {
    const { channel, emit } = fakeChannel();
    const handler = vi.fn();
    const router = createRouter({ getMyOriginIds: () => [MY_UUID] });
    router.listen(channel, '.test', { echo: true }, handler);

    emit('.test', { origin_device_id: '2a8e1b3c-7d4f-4a6b-8c1d-5e9f3b2a6d44', command_id: 'c1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('мой uuid ещё неизвестен — применяем (не глушим вслепую)', () => {
    const { channel, emit } = fakeChannel();
    const handler = vi.fn();
    const router = createRouter({ getMyOriginIds: () => [] });
    router.listen(channel, '.test', { echo: true }, handler);

    emit('.test', { origin_device_id: MY_UUID });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('origin отсутствует — применяем', () => {
    const { channel, emit } = fakeChannel();
    const handler = vi.fn();
    const router = createRouter({ getMyOriginIds: () => [MY_UUID] });
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
    expect(isOwnEcho(MY_UUID, [MY_UUID])).toBe(true);
    expect(isOwnEcho(MY_UUID, [MY_UUID, '2a8e1b3c-7d4f-4a6b-8c1d-5e9f3b2a6d44'])).toBe(true);
    expect(isOwnEcho('2a8e1b3c-7d4f-4a6b-8c1d-5e9f3b2a6d44', [MY_UUID])).toBe(false);
    expect(isOwnEcho(null, [MY_UUID])).toBe(false);
    expect(isOwnEcho(MY_UUID, [])).toBe(false);
  });

  it('markCommand: первый раз false, повтор true, null не дедуплицирует', () => {
    expect(markCommand('a')).toBe(false);
    expect(markCommand('a')).toBe(true);
    expect(markCommand(null)).toBe(false);
    expect(markCommand(undefined)).toBe(false);
  });
});
