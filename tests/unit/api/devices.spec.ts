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
}));

const getMock = vi.mocked(http.get);
const postMock = vi.mocked(http.post);
const patchMock = vi.mocked(http.patch);
const deleteMock = vi.mocked(http.delete);

const UUID = '9f1c7a2e-4b3d-4c8a-9e5f-2d6b0a1c4f77';

const device: PlayerDevice = {
  device_uuid: UUID,
  name: 'Pixel 7',
  type: 'phone',
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

  it('activateDevice шлёт device_uuid в path и эхо телом', async () => {
    patchMock.mockResolvedValue({ state: null, queue: [] });
    await activateDevice(UUID, { origin_device_id: 'uuid-1', command_id: 'cmd-2' });
    expect(patchMock).toHaveBeenCalledWith(`player/devices/${UUID}/activate`, {
      origin_device_id: 'uuid-1',
      command_id: 'cmd-2',
    });
  });

  it('removeDevice передаёт device_uuid в path и эхо-поля телом', async () => {
    deleteMock.mockResolvedValue({ message: 'Устройство удалено.' });
    await removeDevice(UUID, { origin_device_id: 'uuid-1', command_id: 'cmd-3' });
    expect(deleteMock).toHaveBeenCalledWith(`player/devices/${UUID}`, {
      data: { origin_device_id: 'uuid-1', command_id: 'cmd-3' },
    });
  });

  it('sendHeartbeat шлёт origin_device_id (api.md §4)', async () => {
    postMock.mockResolvedValue({ message: 'ok' });
    await sendHeartbeat('uuid-1');
    expect(postMock).toHaveBeenCalledWith('player/devices/heartbeat', { origin_device_id: 'uuid-1' });
  });
});
