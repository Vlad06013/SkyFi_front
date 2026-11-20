import { Preferences } from '@capacitor/preferences';

const DEVICE_KEY = 'skyfi.device';

/**
 * Локальная идентичность устройства. `uuid` генерируется на устройстве
 * и является origin_device_id при регистрации (api.md §1.6, §4); `serverId`
 * — data.id из ответа POST /player/devices, им подписываем команды
 * и сравниваем эхо в ивентах.
 */
export interface StoredDevice {
  uuid: string;
  serverId: number | null;
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
  const device: StoredDevice = { uuid: crypto.randomUUID(), serverId: null };
  await Preferences.set({ key: DEVICE_KEY, value: JSON.stringify(device) });
  return device;
}

/** Сохраняем серверный id после регистрации (повторные запуски не дёргают лишний POST). */
export async function saveServerId(serverId: number): Promise<StoredDevice | null> {
  const stored = await getDevice();
  if (!stored) return null;
  const next: StoredDevice = { ...stored, serverId };
  await Preferences.set({ key: DEVICE_KEY, value: JSON.stringify(next) });
  return next;
}

export async function clearDevice(): Promise<void> {
  await Preferences.remove({ key: DEVICE_KEY });
}
