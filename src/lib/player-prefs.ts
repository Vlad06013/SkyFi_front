import { Preferences } from '@capacitor/preferences';

const PREFS_KEY = 'skyfi.player-prefs';

/**
 * Настройки плеера на устройстве, рядом с историей поиска. Режим клипов
 * здесь не храним: серверный флаг. Качество клипа — наоборот, локальное
 * (экраны устройств разные, сокетами не синхронизируем): храним именно выбор
 * пользователя — рабочее значение в сторе может быть зажато клампом потоков.
 */
export interface PlayerDevicePrefs {
  volume: number;
  /** Высота качества клипа (потолок ABR или фикс); null — ещё не выбирали. */
  clipQuality: number | null;
  /** true — ABR с потолком clipQuality; false — фиксированное качество. */
  clipHlsAuto: boolean;
}

function clampVolume(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(Math.min(100, Math.max(0, value)));
}

function clampQuality(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const quality = Math.round(value);
  return quality >= 144 && quality <= 4320 ? quality : null;
}

export async function readPlayerDevicePrefs(): Promise<PlayerDevicePrefs | null> {
  const { value } = await Preferences.get({ key: PREFS_KEY });
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PlayerDevicePrefs>;
    const volume = clampVolume(parsed.volume);
    if (volume == null) return null;
    return {
      volume,
      clipQuality: clampQuality(parsed.clipQuality),
      clipHlsAuto: parsed.clipHlsAuto !== false,
    };
  } catch {
    return null;
  }
}

export async function writePlayerDevicePrefs(prefs: PlayerDevicePrefs): Promise<void> {
  await Preferences.set({
    key: PREFS_KEY,
    value: JSON.stringify({
      volume: clampVolume(prefs.volume) ?? 0,
      clipQuality: clampQuality(prefs.clipQuality),
      clipHlsAuto: prefs.clipHlsAuto,
    }),
  });
}
