import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { DeviceType } from '@/types';

/** auto — раскладка по ширине окна. На телефоне и магнитоле его нет. */
export type LayoutProfile = 'auto' | 'phone' | 'car' | 'tv';

const STORAGE_KEY = 'skyfi.layout';
/** Тот же ключ, что пишет Preferences в браузере — чтобы класс встал до mount. */
const WEB_STORAGE_KEY = `CapacitorStorage.${STORAGE_KEY}`;

const PROFILES: readonly LayoutProfile[] = ['auto', 'phone', 'car', 'tv'];

export function isLayoutProfile(value: string | null | undefined): value is LayoutProfile {
  return PROFILES.includes(value as LayoutProfile);
}

/** Браузер без выбора смотрит на ширину окна. APK по умолчанию — телефон. */
export function defaultLayoutProfile(): LayoutProfile {
  return Capacitor.isNativePlatform() ? 'phone' : 'auto';
}

/**
 * Тип устройства на бэк. Явный профиль уходит как есть.
 * auto в браузере — computer, как регистрация была до профилей.
 */
export function deviceTypeForLayout(profile: LayoutProfile): DeviceType {
  if (profile === 'phone' || profile === 'car' || profile === 'tv') return profile;
  return Capacitor.isNativePlatform() ? 'phone' : 'computer';
}

/** Класс на <html>: auto снимает data-layout, ширины из tokens.css живут сами. */
export function applyLayoutProfile(profile: LayoutProfile): void {
  const root = document.documentElement;
  if (profile === 'auto') delete root.dataset.layout;
  else root.dataset.layout = profile;
}

/** Синхронное чтение браузерного ключа. На APK Preferences не здесь — вернёт null. */
export function peekLayoutProfile(): LayoutProfile | null {
  try {
    const value = localStorage.getItem(WEB_STORAGE_KEY);
    if (!isLayoutProfile(value)) return null;
    if (Capacitor.isNativePlatform() && value === 'auto') return 'phone';
    return value;
  } catch {
    return null;
  }
}

export async function readLayoutProfile(): Promise<LayoutProfile> {
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (!isLayoutProfile(value)) return defaultLayoutProfile();
    if (Capacitor.isNativePlatform() && value === 'auto') return 'phone';
    return value;
  } catch {
    return defaultLayoutProfile();
  }
}

export async function writeLayoutProfile(profile: LayoutProfile): Promise<void> {
  await Preferences.set({ key: STORAGE_KEY, value: profile });
}
