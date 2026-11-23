import { Preferences } from '@capacitor/preferences';

const DEVICE_KEY = 'skyfi.device';

/**
 * Локальная идентичность устройства: постоянный uuid, генерируется на
 * устройстве. Это единственный идентификатор устройства на проводе —
 * origin_device_id команд и device_uuid в путях/списках (api.md §1.6, §4);
 * серверных id устройств больше нет.
 */
export interface StoredDevice {
  uuid: string;
}

export async function getDevice(): Promise<StoredDevice | null> {
  const { value } = await Preferences.get({ key: DEVICE_KEY });
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as StoredDevice;
    return typeof parsed?.uuid === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/** Идентичность всегда есть: при первом вызове генерируем uuid (api.md требует строгий UUID). */
export async function ensureDevice(): Promise<StoredDevice> {
  const stored = await getDevice();
  if (stored) return stored;
  const device: StoredDevice = { uuid: crypto.randomUUID() };
  await Preferences.set({ key: DEVICE_KEY, value: JSON.stringify(device) });
  return device;
}

export async function clearDevice(): Promise<void> {
  await Preferences.remove({ key: DEVICE_KEY });
}
