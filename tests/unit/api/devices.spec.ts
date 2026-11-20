import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import { activateDevice, fetchDevices, registerDevice, removeDevice, sendHeartbeat } from '@/api/devices';
import type { PlayerDevice } from '@/types';

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  httpRaw: {},
}));

const getMock = vi.mocked(http.get);
const postMock = vi.mocked(http.post);
const patchMock = vi.mocked(http.patch);
const deleteMock = vi.mocked(http.delete);

const device: PlayerDevice = {
  id: 7,
  name: 'Pixel 7',
  type: 'phone',
  is_active: true,
  last_seen_at: '2026-11-20T06:00:00.000000Z',
};

describe('api/devices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchDevices разворачивает data.devices (curl 2026-11-20)', async () => {
    getMock.mockResolvedValue({ devices: [device] });
    await expect(fetchDevices()).resolves.toEqual([device]);
    expect(getMock).toHaveBeenCalledWith('player/devices');
  });

  it('registerDevice шлёт uuid и эхо-поля на player/devices', async () => {
    postMock.mockResolvedValue(device);
    await expect(
      registerDevice({ name: 'Pixel 7', type: 'phone', origin_device_id: 'uuid-1', command_id: 'cmd-1' }),
    ).resolves.toEqual(device);
    expect(postMock).toHaveBeenCalledWith('player/devices', {
      name: 'Pixel 7',
      type: 'phone',
      origin_device_id: 'uuid-1',
      command_id: 'cmd-1',
    });
  });

  it('activateDevice шлёт серверный id устройства в path и эхо', async () => {
    patchMock.mockResolvedValue({ state: null, queue: [] });
    await activateDevice(7, { origin_device_id: 7, command_id: 'cmd-2' });
    expect(patchMock).toHaveBeenCalledWith('player/devices/7/activate', {
      origin_device_id: 7,
      command_id: 'cmd-2',
    });
  });

  it('removeDevice передаёт эхо-поля query-параметрами', async () => {
    deleteMock.mockResolvedValue({ message: 'Устройство удалено.' });
    await removeDevice(7, { origin_device_id: 7, command_id: 'cmd-3' });
    expect(deleteMock).toHaveBeenCalledWith('player/devices/7', {
      params: { origin_device_id: 7, command_id: 'cmd-3' },
    });
  });

  it('sendHeartbeat живёт на player/devices/heartbeat (curl 2026-11-20)', async () => {
    postMock.mockResolvedValue({ message: 'ok' });
    await sendHeartbeat('uuid-1');
    expect(postMock).toHaveBeenCalledWith('player/devices/heartbeat', { device_uuid: 'uuid-1' });
  });
});
