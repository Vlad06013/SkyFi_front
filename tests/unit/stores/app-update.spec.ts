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

const external = vi.hoisted(() => ({
  openExternalUrl: vi.fn(),
}));

vi.mock('@/lib/external-url', () => ({
  openExternalUrl: external.openExternalUrl,
}));

const update = (mandatory: boolean): AppUpdatePayload => ({
  kind: 'bundle',
  version: '1.1.0',
  url: 'https://example.test/app-updates/download/1?signature=x',
  sha256: 'abc',
  size_bytes: 1000,
  mandatory,
  notes: 'починили плеер',
});

const apkUpdate = (mandatory: boolean): AppUpdatePayload => ({
  ...update(mandatory),
  kind: 'apk',
  version: '1.2.0',
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
    external.openExternalUrl.mockReset();
  });

  it('шлёт версию бандла и оболочку X.Y.Z', async () => {
    vi.mocked(fetchAppUpdate).mockResolvedValue(null);
    const store = useAppUpdateStore();
    await store.check(true);
    expect(fetchAppUpdate).toHaveBeenCalledWith(BUNDLE_VERSION, '1.0.0');
    expect(useToastStore().toast?.title).toBe('Обновлений нет');
    expect(useToastStore().toast?.who).toBe(`бандл ${BUNDLE_VERSION} · APK 1.0.0`);
    expect(store.idle).toBe(`бандл ${BUNDLE_VERSION} · APK 1.0.0`);
  });

  it('сначала предлагает обновиться и не качает, пока не подтвердили', async () => {
    updater.download.mockResolvedValue({ id: 'bundle-2' });
    vi.mocked(fetchAppUpdate).mockResolvedValue(update(false));
    const store = useAppUpdateStore();
    await store.check();
    expect(store.promptOpen).toBe(true);
    expect(store.promptMessage).toBe('починили плеер');
    expect(store.idle).toBe('бандл 1.1.0');
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

  it('оффер без kind считается бандлом (старый бэк)', async () => {
    updater.download.mockResolvedValue({ id: 'bundle-3' });
    // Бэк до контракта kind не слал; тип уже новый, поэтому ответ собираем без поля.
    const { kind: _dropped, ...legacy } = update(false);
    vi.mocked(fetchAppUpdate).mockResolvedValue(legacy as AppUpdatePayload);
    const store = useAppUpdateStore();
    await store.check();
    await store.accept();
    expect(updater.download).toHaveBeenCalled();
    expect(external.openExternalUrl).not.toHaveBeenCalled();
  });

  it('оффер оболочки уходит в браузер и не трогает updater', async () => {
    vi.mocked(fetchAppUpdate).mockResolvedValue(apkUpdate(false));
    const store = useAppUpdateStore();
    await store.check();
    expect(store.promptOpen).toBe(true);
    expect(store.promptTitle).toBe('Обновить приложение до 1.2.0?');
    expect(store.idle).toBe('APK 1.2.0');
    await store.accept();
    expect(external.openExternalUrl).toHaveBeenCalledWith(apkUpdate(false).url);
    expect(updater.download).not.toHaveBeenCalled();
    expect(updater.set).not.toHaveBeenCalled();
    expect(store.promptOpen).toBe(false);
    expect(useToastStore().toast?.title).toBe('Скачивание APK');
  });

  it('обязательную оболочку нельзя закрыть, «Обновить» уводит в браузер', async () => {
    vi.mocked(fetchAppUpdate).mockResolvedValue(apkUpdate(true));
    const store = useAppUpdateStore();
    await store.check();
    expect(store.promptTitle).toBe('Нужно обновление приложения 1.2.0');
    store.dismiss();
    expect(store.promptOpen).toBe(true);
    await store.accept();
    expect(external.openExternalUrl).toHaveBeenCalled();
    expect(store.promptOpen).toBe(false);
  });
});
