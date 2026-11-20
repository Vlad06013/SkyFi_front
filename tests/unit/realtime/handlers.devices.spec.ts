import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  handleDeviceChanged,
  handleDeviceConnected,
  handleDeviceDisconnected,
} from '@/realtime/handlers/devices';
import { useDevicesStore } from '@/stores/devices';
import type { PlayerDevice } from '@/types';

vi.mock('@/api/devices', () => ({
  fetchDevices: vi.fn(),
  registerDevice: vi.fn(),
  activateDevice: vi.fn(),
  removeDevice: vi.fn(),
  sendHeartbeat: vi.fn(),
}));

const device = (id: number): PlayerDevice => ({
  id,
  name: `dev-${id}`,
  type: 'phone',
  is_active: false,
  last_seen_at: null,
});

describe('realtime/handlers/devices', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('connected: валидный payload → upsert в сторе', () => {
    const store = useDevicesStore();
    handleDeviceConnected({ device: device(1), origin_device_id: null });
    expect(store.devices.map((d) => d.id)).toEqual([1]);
  });

  it('connected: payload без device игнорируется', () => {
    const store = useDevicesStore();
    handleDeviceConnected({ device: null as never, origin_device_id: null });
    expect(store.devices).toHaveLength(0);
  });

  it('changed: переключает активное устройство', () => {
    const store = useDevicesStore();
    store.devices = [device(1), device(2)];
    handleDeviceChanged({ device_id: 2, origin_device_id: 1 });
    expect(store.activeId).toBe(2);
  });

  it('changed: null device_id игнорируется', () => {
    const store = useDevicesStore();
    store.devices = [device(1)];
    handleDeviceChanged({ device_id: null as never, origin_device_id: null });
    expect(store.activeId).toBeNull();
  });

  it('disconnected: убирает устройство из списка', () => {
    const store = useDevicesStore();
    store.devices = [device(1), device(2)];
    handleDeviceDisconnected({
      device_id: 1,
      device_name: 'dev-1',
      origin_device_id: null,
      command_id: null,
    });
    expect(store.devices.map((d) => d.id)).toEqual([2]);
  });

  it('disconnected: null device_id игнорируется', () => {
    const store = useDevicesStore();
    store.devices = [device(1)];
    handleDeviceDisconnected({
      device_id: null as never,
      device_name: '',
      origin_device_id: null,
      command_id: null,
    });
    expect(store.devices).toHaveLength(1);
  });
});
