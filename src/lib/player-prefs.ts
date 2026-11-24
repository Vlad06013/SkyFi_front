import { Preferences } from '@capacitor/preferences';

const PREFS_KEY = 'skyfi.player-prefs';

/** Громкость и режим клипов — на устройстве, рядом с историей поиска. */
export interface PlayerDevicePrefs {
  volume: number;
  clipMode: boolean;
}

function clampVolume(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(Math.min(100, Math.max(0, value)));
}

export async function readPlayerDevicePrefs(): Promise<PlayerDevicePrefs | null> {
  const { value } = await Preferences.get({ key: PREFS_KEY });
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PlayerDevicePrefs>;
    const volume = clampVolume(parsed.volume);
    if (volume == null || typeof parsed.clipMode !== 'boolean') return null;
    return { volume, clipMode: parsed.clipMode };
  } catch {
    return null;
  }
}

export async function writePlayerDevicePrefs(prefs: PlayerDevicePrefs): Promise<void> {
  await Preferences.set({
    key: PREFS_KEY,
    value: JSON.stringify({ volume: clampVolume(prefs.volume) ?? 0, clipMode: prefs.clipMode }),
  });
}
