import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import * as devicesApi from '@/api/devices';
import { ApiError } from '@/api/http';
import * as identity from '@/lib/device';
import { useAuthStore } from '@/stores/auth';
import { HEARTBEAT_INTERVAL_MS, useDevicesStore } from '@/stores/devices';
import { useOnlineStore } from '@/stores/online';
import type { PlayerDevice } from '@/types';

vi.mock('@/api/devices', () => ({
  fetchDevices: vi.fn(),
  registerDevice: vi.fn(),
  activateDevice: vi.fn(),
  removeDevice: vi.fn(),
  sendHeartbeat: vi.fn(),
}));

vi.mock('@/lib/device', () => ({
  ensureDevice: vi.fn(),
  getDevice: vi.fn(),
  clearDevice: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capacitor/device', () => ({
  Device: { getInfo: vi.fn() },
}));

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn() },
}));

const registerDeviceMock = vi.mocked(devicesApi.registerDevice);
const fetchDevicesMock = vi.mocked(devicesApi.fetchDevices);
const sendHeartbeatMock = vi.mocked(devicesApi.sendHeartbeat);
const ensureDeviceMock = vi.mocked(identity.ensureDevice);

const uuid = (n: number) => `9f1c7a2e-4b3d-4c8a-9e5f-2d6b0a1c4f7${n}`;

const device = (n: number): PlayerDevice => ({
  device_uuid: uuid(n),
  name: `dev-${n}`,
  type: 'phone',
  last_seen_at: null,
});

/** Флаш микротасков под фейковыми таймерами. */
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

describe('stores/devices', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.clearAllMocks();
    ensureDeviceMock.mockResolvedValue({ uuid: 'uuid-1' });
    // registerPresence сидит presence-список — по умолчанию пустой.
    fetchDevicesMock.mockResolvedValue([]);
  });

  describe('список', () => {
    it('ensure грузит список и ставит loaded', async () => {
      fetchDevicesMock.mockResolvedValue([device(1), device(2)]);
      const store = useDevicesStore();

      await store.ensure();
      expect(store.devices).toHaveLength(2);
      expect(store.loaded).toBe(true);
    });

    it('неудача — loaded остаётся false, повторим при следующем открытии', async () => {
      fetchDevicesMock.mockRejectedValue(new Error('down'));
      const store = useDevicesStore();

      await store.ensure();
      expect(store.loaded).toBe(false);
      expect(store.devices).toHaveLength(0);
    });

    it('refresh перечитывает список даже после loaded', async () => {
      fetchDevicesMock.mockResolvedValue([device(1)]);
      const store = useDevicesStore();
      await store.ensure();
      expect(store.devices).toHaveLength(1);

      fetchDevicesMock.mockResolvedValue([device(1), device(2)]);
      await store.refresh();
      expect(store.devices).toHaveLength(2);
    });
  });

  describe('мутации списка (сокет-ивенты)', () => {
    it('applyConnected: добавляет новое и обновляет существующее', () => {
      const store = useDevicesStore();
      store.applyConnected(device(1));

      store.applyConnected({ ...device(1), name: 'переименовано' });
      expect(store.devices).toHaveLength(1);
      expect(store.devices[0].name).toBe('переименовано');

      store.applyConnected(device(2));
      expect(store.devices).toHaveLength(2);
    });

    it('applyDisconnected убирает устройство', () => {
      const store = useDevicesStore();
      store.devices = [device(1), device(2)];

      store.applyDisconnected(uuid(1));
      expect(store.devices.map((d) => d.device_uuid)).toEqual([uuid(2)]);
    });
  });

  describe('presence', () => {
    it('registerPresence: регистрирует по uuid и сидит presence-список', async () => {
      registerDeviceMock.mockResolvedValue(device(5));
      fetchDevicesMock.mockResolvedValue([device(5), device(6)]);
      const store = useDevicesStore();

      await expect(store.registerPresence()).resolves.toBe(true);
      expect(registerDeviceMock).toHaveBeenCalledWith({
        name: expect.any(String),
        type: 'computer',
        origin_device_id: 'uuid-1',
        command_id: expect.any(String),
      });
      expect(store.myDeviceUuid).toBe('uuid-1');
      expect(store.registered).toBe(true);
      await flush();
      expect(fetchDevicesMock).toHaveBeenCalled();
      expect(store.devices.map((d) => d.device_uuid)).toEqual([uuid(5), uuid(6)]);
      expect(store.loaded).toBe(true);
    });

    it('registerPresence: бэк недоступен — false, список не сидится', async () => {
      registerDeviceMock.mockRejectedValue(new Error('down'));
      const store = useDevicesStore();

      await expect(store.registerPresence()).resolves.toBe(false);
      expect(store.registered).toBe(false);
      expect(store.devices).toHaveLength(0);
      expect(fetchDevicesMock).not.toHaveBeenCalled();
    });

    it('bindPresence: auth+online → регистрация + heartbeat раз в интервал', async () => {
      registerDeviceMock.mockResolvedValue(device(5));
      sendHeartbeatMock.mockResolvedValue({ message: 'ok' });
      const auth = useAuthStore();
      const online = useOnlineStore();
      auth.user = { id: 1, name: 'Влад', email: 'v@mail.ru', avatar_url: null };
      online.isOnline = true;

      const store = useDevicesStore();
      store.bindPresence();
      await flush();

      expect(store.myDeviceUuid).toBe('uuid-1');
      expect(sendHeartbeatMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(sendHeartbeatMock).toHaveBeenCalledTimes(1);
      expect(sendHeartbeatMock).toHaveBeenCalledWith('uuid-1');

      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      expect(sendHeartbeatMock).toHaveBeenCalledTimes(2);
    });

    it('logout → reset: список чистится, heartbeat останавливается', async () => {
      registerDeviceMock.mockResolvedValue(device(5));
      sendHeartbeatMock.mockResolvedValue({ message: 'ok' });
      const auth = useAuthStore();
      const online = useOnlineStore();
      auth.user = { id: 1, name: 'Влад', email: 'v@mail.ru', avatar_url: null };
      online.isOnline = true;

      const store = useDevicesStore();
      store.bindPresence();
      await flush();
      expect(store.myDeviceUuid).toBe('uuid-1');

      auth.user = null;
      await flush();
      expect(store.myDeviceUuid).toBeNull();
      expect(store.devices).toHaveLength(0);

      const calls = sendHeartbeatMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
      expect(sendHeartbeatMock).toHaveBeenCalledTimes(calls);
    });

    it('heartbeat 404 регистрирует устройство заново', async () => {
      registerDeviceMock.mockResolvedValue(device(5));
      sendHeartbeatMock.mockRejectedValue(new ApiError(404, 'not-found', 'Устройство не найдено'));
      const auth = useAuthStore();
      const online = useOnlineStore();
      auth.user = { id: 1, name: 'Влад', email: 'v@mail.ru', avatar_url: null };
      online.isOnline = true;

      const store = useDevicesStore();
      store.bindPresence();
      await flush();
      expect(registerDeviceMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
      await flush();
      expect(registerDeviceMock).toHaveBeenCalledTimes(2);
      expect(store.registered).toBe(true);
    });
  });
});
