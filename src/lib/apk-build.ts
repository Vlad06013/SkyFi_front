/** Сборка Android: файл в корне ветки, не вершина репозитория. */
export const APK_URL = 'https://github.com/Vlad06013/SkyFi_front/raw/dev_v2/skyFy.apk';

const TREE_URL = 'https://api.github.com/repos/Vlad06013/SkyFi_front/git/trees/dev_v2';
const APK_PATH = 'skyFy.apk';
const STORED_KEY = 'skyfi.apk-blob';

/** Хвост blob-sha: короткий и меняется вместе с байтами файла. */
export function shortBlob(sha: string): string {
  return sha.slice(-7);
}

export function readInstalledBlob(): string | null {
  try {
    return localStorage.getItem(STORED_KEY);
  } catch {
    return null;
  }
}

export function writeInstalledBlob(sha: string): void {
  try {
    localStorage.setItem(STORED_KEY, sha);
  } catch {
    // Приватный режим: сравнение живёт только в памяти.
  }
}

export function openApkDownload(): void {
  window.open(APK_URL, '_blank', 'noopener');
}

interface TreeEntry {
  path?: string;
  type?: string;
  sha?: string;
}

/** Blob-sha skyFy.apk. Другие коммиты ветки его не меняют. */
export async function fetchApkBlob(signal?: AbortSignal): Promise<string | null> {
  const response = await fetch(TREE_URL, {
    signal,
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { tree?: TreeEntry[] };
  const file = body.tree?.find((item) => item.path === APK_PATH && item.type === 'blob');
  return file?.sha || null;
}
