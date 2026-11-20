import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import * as devicesApi from '@/api/devices';
import * as identity from '@/lib/device';
import { useAuthStore } from '@/stores/auth';
import { HEARTBEAT_INTERVAL_MS, useDevicesStore } from '@/stores/devices';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
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
  saveServerId: vi.fn(),
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
const activateDeviceMock = vi.mocked(devicesApi.activateDevice);
const sendHeartbeatMock = vi.mocked(devicesApi.sendHeartbeat);
const ensureDeviceMock = vi.mocked(identity.ensureDevice);
const saveServerIdMock = vi.mocked(identity.saveServerId);

const device = (id: number, isActive = false): PlayerDevice => ({
  id,
  name: `dev-${id}`,
  type: 'phone',
  is_active: isActive,
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
    ensureDeviceMock.mockResolvedValue({ uuid: 'uuid-1', serverId: null });
    saveServerIdMock.mockResolvedValue({ uuid: 'uuid-1', serverId: 5 });
  });

  describe('список', () => {
    it('ensure грузит список и ставит loaded', async () => {
      fetchDevicesMock.mockResolvedValue([device(1), device(2, true)]);
      const store = useDevicesStore();

      await store.ensure();
      expect(store.devices).toHaveLength(2);
      expect(store.loaded).toBe(true);
      expect(store.activeId).toBe(2);
    });

    it('неудача сбрасывает флажок — повторим при следующем открытии', async () => {
      fetchDevicesMock.mockRejectedValue(new Error('down'));
      const store = useDevicesStore();

      await store.ensure();
      expect(store.loaded).toBe(false);
      expect(store.devices).toHaveLength(0);
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

    it('applyChanged переключает is_active', () => {
      const store = useDevicesStore();
      store.devices = [device(1, true), device(2)];

      store.applyChanged(2);
      expect(store.devices.find((d) => d.id === 1)?.is_active).toBe(false);
      expect(store.devices.find((d) => d.id === 2)?.is_active).toBe(true);
      expect(store.activeId).toBe(2);
    });

    it('applyDisconnected убирает устройство', () => {
      const store = useDevicesStore();
      store.devices = [device(1), device(2)];

      store.applyDisconnected(1);
      expect(store.devices.map((d) => d.id)).toEqual([2]);
    });
  });

  describe('activate', () => {
    it('успех: оптимистично переключает, сервер подтвердил', async () => {
      const store = useDevicesStore();
      store.devices = [device(1, true), device(2)];
      store.myDeviceId = 1;
      activateDeviceMock.mockResolvedValue({ state: null as never, queue: [] });

      await expect(store.activate(2)).resolves.toBe(true);
      expect(activateDeviceMock).toHaveBeenCalledWith(2, { origin_device_id: 1, command_id: expect.any(String) });
      expect(store.activeId).toBe(2);
    });

    it('ошибка: откат к прежнему активному + тост', async () => {
      const store = useDevicesStore();
      const toast = useToastStore();
      store.devices = [device(1, true), device(2)];
      activateDeviceMock.mockRejectedValue(new Error('бэк упал'));

      await expect(store.activate(2)).resolves.toBe(false);
      expect(store.activeId).toBe(1);
      expect(toast.toast?.error).toBe(true);
    });
  });

  describe('presence', () => {
    it('registerPresence: регистрирует, сохраняет серверный id, добавляет в список', async () => {
      registerDeviceMock.mockResolvedValue(device(5, true));
      const store = useDevicesStore();

      await expect(store.registerPresence()).resolves.toBe(true);
      expect(registerDeviceMock).toHaveBeenCalledWith({
        name: expect.any(String),
        type: 'computer',
        origin_device_id: 'uuid-1',
        command_id: expect.any(String),
      });
      expect(saveServerIdMock).toHaveBeenCalledWith(5);
      expect(store.myDeviceId).toBe(5);
      expect(store.devices.some((d) => d.id === 5)).toBe(true);
    });

    it('registerPresence: бэк недоступен — false, без серверного id', async () => {
      registerDeviceMock.mockRejectedValue(new Error('down'));
      const store = useDevicesStore();

      await expect(store.registerPresence()).resolves.toBe(false);
      expect(store.myDeviceId).toBeNull();
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

      expect(store.myDeviceId).toBe(5);
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
      expect(store.myDeviceId).toBe(5);

      auth.user = null;
      await flush();
      expect(store.myDeviceId).toBeNull();
      expect(store.devices).toHaveLength(0);

      const calls = sendHeartbeatMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
      expect(sendHeartbeatMock).toHaveBeenCalledTimes(calls);
    });
  });
});
