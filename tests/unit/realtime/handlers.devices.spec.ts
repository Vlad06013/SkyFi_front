import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  handleDeviceChanged,
  handleDeviceConnected,
  handleDeviceDisconnected,
} from '@/realtime/handlers/devices';
import { useDevicesStore } from '@/stores/devices';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type { PlayerDevice } from '@/types';

vi.mock('@/api/devices', () => ({
  fetchDevices: vi.fn(),
  registerDevice: vi.fn(),
  activateDevice: vi.fn(),
  removeDevice: vi.fn(),
  sendHeartbeat: vi.fn(),
}));

const uuid = (n: number) => `9f1c7a2e-4b3d-4c8a-9e5f-2d6b0a1c4f7${n}`;

const device = (n: number): PlayerDevice => ({
  device_uuid: uuid(n),
  name: `dev-${n}`,
  type: 'phone',
  last_seen_at: null,
});

describe('realtime/handlers/devices', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('connected: валидный payload → upsert в сторе', () => {
    const store = useDevicesStore();
    handleDeviceConnected({ device: device(1), origin_device_id: null });
    expect(store.devices.map((d) => d.device_uuid)).toEqual([uuid(1)]);
  });

  it('connected: payload без device игнорируется', () => {
    const store = useDevicesStore();
    handleDeviceConnected({ device: null as never, origin_device_id: null });
    expect(store.devices).toHaveLength(0);
  });

  it('connected: незнакомое устройство после сида — тост о новом устройстве', () => {
    const store = useDevicesStore();
    store.loaded = true;
    store.devices = [device(1)];

    handleDeviceConnected({ device: device(2), origin_device_id: null });

    expect(store.devices.map((d) => d.device_uuid)).toEqual([uuid(1), uuid(2)]);
    expect(useToastStore().toast?.title).toBe('dev-2');
    expect(useToastStore().toast?.who).toBe('новое устройство в сети');
  });

  it('connected: известное устройство — без тоста', () => {
    const store = useDevicesStore();
    store.loaded = true;
    store.devices = [device(1)];

    handleDeviceConnected({ device: { ...device(1), name: 'переименовано' }, origin_device_id: null });

    expect(store.devices[0].name).toBe('переименовано');
    expect(useToastStore().toast).toBeNull();
  });

  it('connected: список ещё не сидирован — без тоста (все выглядели бы новыми)', () => {
    const store = useDevicesStore();

    handleDeviceConnected({ device: device(1), origin_device_id: null });

    expect(store.devices).toHaveLength(1);
    expect(useToastStore().toast).toBeNull();
  });

  it('changed: переключает активное устройство в стейте плеера', () => {
    const player = usePlayerStore();
    player.state = { ...player.state, active_device_id: uuid(1) };

    handleDeviceChanged({ device_uuid: uuid(2), origin_device_id: uuid(1) });

    expect(player.state.active_device_id).toBe(uuid(2));
  });

  it('changed: null device_uuid игнорируется', () => {
    const player = usePlayerStore();
    player.state = { ...player.state, active_device_id: uuid(1) };

    handleDeviceChanged({ device_uuid: null as never, origin_device_id: null });

    expect(player.state.active_device_id).toBe(uuid(1));
  });

  it('disconnected: убирает устройство из списка', () => {
    const store = useDevicesStore();
    store.devices = [device(1), device(2)];
    handleDeviceDisconnected({
      device_uuid: uuid(1),
      device_name: 'dev-1',
      origin_device_id: null,
      command_id: null,
    });
    expect(store.devices.map((d) => d.device_uuid)).toEqual([uuid(2)]);
  });

  it('disconnected: удалённое было активным — активного больше нет', () => {
    const store = useDevicesStore();
    store.devices = [device(1), device(2)];
    const player = usePlayerStore();
    player.state = { ...player.state, active_device_id: uuid(1) };

    handleDeviceDisconnected({
      device_uuid: uuid(1),
      device_name: 'dev-1',
      origin_device_id: null,
      command_id: null,
    });

    expect(player.state.active_device_id).toBeNull();
  });

  it('disconnected: удалённое не было активным — стейт плеера не тронут', () => {
    const store = useDevicesStore();
    store.devices = [device(1), device(2)];
    const player = usePlayerStore();
    player.state = { ...player.state, active_device_id: uuid(2) };

    handleDeviceDisconnected({
      device_uuid: uuid(1),
      device_name: 'dev-1',
      origin_device_id: null,
      command_id: null,
    });

    expect(player.state.active_device_id).toBe(uuid(2));
  });

  it('disconnected: null device_uuid игнорируется', () => {
    const store = useDevicesStore();
    store.devices = [device(1)];
    handleDeviceDisconnected({
      device_uuid: null as never,
      device_name: '',
      origin_device_id: null,
      command_id: null,
    });
    expect(store.devices).toHaveLength(1);
  });
});
