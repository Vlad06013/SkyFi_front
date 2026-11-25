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

const nativeApp = vi.hoisted(() => ({
  getInfo: vi.fn(async () => ({ version: '1.0' })),
}));

vi.mock('@capacitor/app', () => ({
  App: nativeApp,
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
    nativeApp.getInfo.mockReset();
    nativeApp.getInfo.mockImplementation(async () => ({ version: '1.0' }));
    vi.mocked(fetchAppUpdate).mockReset();
  });

  it('шлёт версию бандла и оболочку X.Y.Z', async () => {
    vi.mocked(fetchAppUpdate).mockResolvedValue(null);
    await useAppUpdateStore().check(true);
    expect(fetchAppUpdate).toHaveBeenCalledWith(BUNDLE_VERSION, '1.0.0');
    expect(useToastStore().toast?.title).toBe('Обновлений нет');
  });

  it('сначала предлагает обновиться и не качает, пока не подтвердили', async () => {
    updater.download.mockResolvedValue({ id: 'bundle-2' });
    vi.mocked(fetchAppUpdate).mockResolvedValue(update(false));
    const store = useAppUpdateStore();
    await store.check();
    expect(store.promptOpen).toBe(true);
    expect(store.promptMessage).toBe('починили плеер');
    expect(updater.download).not.toHaveBeenCalled();
    store.dismiss();
    expect(store.promptOpen).toBe(false);
  });

  it('обязательное нельзя закрыть, скачивание начинается с «Обновить»', async () => {
    updater.download.mockResolvedValue({ id: 'bundle-1' });
    vi.mocked(fetchAppUpdate).mockResolvedValue(update(true));
    const store = useAppUpdateStore();
    await store.check();
    expect(store.promptOpen).toBe(true);
    expect(updater.download).not.toHaveBeenCalled();
    store.dismiss();
    expect(store.promptOpen).toBe(true);
    await store.accept();
    expect(updater.download).toHaveBeenCalledWith({
      url: update(true).url,
      version: '1.1.0',
      checksum: 'abc',
    });
    expect(updater.set).toHaveBeenCalledWith({ id: 'bundle-1' });
  });

  it('ошибка скачивания видна в тосте и диалог остаётся', async () => {
    updater.download.mockRejectedValue(new Error('httpsOnly is enabled and http://192.168.8.33:8080/api/v1/skyfy/app-updates/download/1?signature=secret is not https'));
    vi.mocked(fetchAppUpdate).mockResolvedValue(update(false));
    const store = useAppUpdateStore();
    await store.check();
    await store.accept();
    expect(store.promptOpen).toBe(true);
    expect(useToastStore().toast?.title).toBe('Не удалось скачать обновление');
    expect(useToastStore().toast?.who).toContain('httpsOnly');
    expect(useToastStore().toast?.who).not.toContain('signature');
  });

  it('зависшая версия оболочки не удерживает запрос', async () => {
    vi.useFakeTimers();
    nativeApp.getInfo.mockImplementation(() => new Promise(() => undefined));
    vi.mocked(fetchAppUpdate).mockResolvedValue(null);
    const pending = useAppUpdateStore().check(true);
    await vi.advanceTimersByTimeAsync(1_500);
    await pending;
    expect(fetchAppUpdate).toHaveBeenCalledWith(BUNDLE_VERSION, '1.0.0');
    vi.useRealTimers();
  });
});
