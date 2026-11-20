import { Preferences } from '@capacitor/preferences';

const HISTORY_KEY = 'skyfi.search-history';
const HISTORY_LIMIT = 10;

/** История поиска — только на устройстве (тот же Preferences, что и сессия). */
export async function getSearchHistory(): Promise<string[]> {
  const { value } = await Preferences.get({ key: HISTORY_KEY });
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Свежий запрос — в начало списка, без дублей, с потолком HISTORY_LIMIT. */
export async function pushSearchHistory(query: string): Promise<string[]> {
  const current = await getSearchHistory();
  const next = [query, ...current.filter((item) => item !== query)].slice(0, HISTORY_LIMIT);
  await Preferences.set({ key: HISTORY_KEY, value: JSON.stringify(next) });
  return next;
}

/** Полная очистка истории поиска на устройстве. */
export async function clearSearchHistory(): Promise<void> {
  await Preferences.remove({ key: HISTORY_KEY });
}
