/** Сборка Android: файл в корне ветки, не вершина репозитория. */
export const APK_URL = 'https://github.com/Vlad06013/SkyFi_front/raw/dev_v2/skyFy.apk';

const TREE_URL = 'https://api.github.com/repos/Vlad06013/SkyFi_front/git/trees/dev_v2';
const APK_PATH = 'skyFy.apk';
const STORED_KEY = 'skyfi.apk-blob';
const PENDING_KEY = 'skyfi.apk-pending';
const BUILD_KEY = 'skyfi.apk-build';

export interface InstallMark {
  seenBuild: string | null;
  pending: string | null;
  installed: string | null;
}

/**
 * Скачивание само по себе сборку не ставит: отмена оставляла новый sha
 * в «установленных», и проверка навсегда отвечала «актуальна».
 * Номер сборки Android сменился — значит, пакет реально поставился,
 * и ждущий sha можно считать установленным. Не сменился — ждущий забываем.
 * Первый запуск этой схемы сбрасывает старую отметку (её писали по клику).
 */
export function settleInstall(current: InstallMark, runningBuild: string): InstallMark {
  if (current.seenBuild === runningBuild) {
    return { seenBuild: runningBuild, pending: null, installed: current.installed };
  }
  if (current.seenBuild != null && current.pending) {
    return { seenBuild: runningBuild, pending: null, installed: current.pending };
  }
  return { seenBuild: runningBuild, pending: null, installed: null };
}

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

export function clearInstalledBlob(): void {
  try {
    localStorage.removeItem(STORED_KEY);
  } catch {
    /* приватный режим */
  }
}

export function readPendingBlob(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function writePendingBlob(sha: string): void {
  try {
    localStorage.setItem(PENDING_KEY, sha);
  } catch {
    /* приватный режим */
  }
}

export function clearPendingBlob(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* приватный режим */
  }
}

export function readSeenBuild(): string | null {
  try {
    return localStorage.getItem(BUILD_KEY);
  } catch {
    return null;
  }
}

export function writeSeenBuild(build: string): void {
  try {
    localStorage.setItem(BUILD_KEY, build);
  } catch {
    /* приватный режим */
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
