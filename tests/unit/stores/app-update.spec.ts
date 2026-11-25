import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { fetchAppUpdate } from '@/api/app-updates';
import { BUNDLE_VERSION } from '@/lib/bundle-version';
import { useAppUpdateStore } from '@/stores/app-update';
import { useToastStore } from '@/stores/toast';
import type { AppUpdatePayload } from '@/types/app-update';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock('@capacitor/app', () => ({
  App: { getInfo: vi.fn(async () => ({ version: '1.0' })) },
}));

const updater = vi.hoisted(() => ({
  download: vi.fn(),
  set: vi.fn(),
  addListener: vi.fn(),
}));

vi.mock('@capgo/capacitor-updater', () => ({
  CapacitorUpdater: updater,
}));

vi.mock('@/api/app-updates', () => ({
  fetchAppUpdate: vi.fn(),
}));

const update = (mandatory: boolean): AppUpdatePayload => ({
  version: '1.1.0',
  url: 'https://example.test/app-updates/download/1?signature=x',
  sha256: 'abc',
  size_bytes: 1000,
  mandatory,
  notes: 'починили плеер',
});

describe('app update', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    updater.download.mockReset();
    updater.set.mockReset();
    updater.addListener.mockReset();
    updater.addListener.mockResolvedValue({ remove: vi.fn(async () => undefined) });
    updater.set.mockResolvedValue(undefined);
    vi.mocked(fetchAppUpdate).mockReset();
  });

  it('шлёт версию бандла и оболочку X.Y.Z', async () => {
    vi.mocked(fetchAppUpdate).mockResolvedValue(null);
    await useAppUpdateStore().check(true);
    expect(fetchAppUpdate).toHaveBeenCalledWith(BUNDLE_VERSION, '1.0.0');
    expect(useToastStore().toast?.title).toBe('Обновлений нет');
  });

  it('обязательное открывает диалог сразу и без отмены', async () => {
    let finish: (bundle: { id: string }) => void = () => undefined;
    updater.download.mockImplementation(
      () => new Promise((resolve) => { finish = resolve; }),
    );
    vi.mocked(fetchAppUpdate).mockResolvedValue(update(true));
    const store = useAppUpdateStore();
    const pending = store.check();
    await vi.waitFor(() => expect(store.promptOpen).toBe(true));
    expect(store.mandatory).toBe(true);
    store.dismiss();
    expect(store.promptOpen).toBe(true);
    finish({ id: 'bundle-1' });
    await pending;
    expect(store.ready).toBe(true);
    expect(store.promptMessage).toBe('починили плеер');
  });

  it('обычное спрашивает только когда архив уже скачан', async () => {
    updater.download.mockResolvedValue({ id: 'bundle-2' });
    vi.mocked(fetchAppUpdate).mockResolvedValue(update(false));
    const store = useAppUpdateStore();
    await store.check();
    expect(store.promptOpen).toBe(true);
    expect(updater.download).toHaveBeenCalledWith({
      url: update(false).url,
      version: '1.1.0',
      checksum: 'abc',
    });
    store.dismiss();
    expect(store.promptOpen).toBe(false);
    await store.apply();
    expect(updater.set).toHaveBeenCalledWith({ id: 'bundle-2' });
  });
});
