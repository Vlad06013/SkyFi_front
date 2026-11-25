import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { fetchApkBlob, shortBlob } from '@/lib/apk-build';
import { useApkBuildStore } from '@/stores/apk-build';
import { useToastStore } from '@/stores/toast';

const native = vi.hoisted(() => ({ value: true }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.value },
}));

const tree = (sha: string) => ({
  tree: [{ path: 'skyFy.apk', type: 'blob', sha }],
});

describe('apk blob', () => {
  beforeEach(() => {
    localStorage.clear();
    native.value = true;
    setActivePinia(createPinia());
    vi.stubGlobal('fetch', vi.fn());
  });

  it('короткий sha — хвост blob', () => {
    expect(shortBlob('0123456789abcdef')).toBe('9abcdef');
  });

  it('из дерева ветки берётся только skyFy.apk', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => tree('aaaabbbbccccddddeeeeffff0000111122223333'),
    } as Response);
    await expect(fetchApkBlob()).resolves.toBe('aaaabbbbccccddddeeeeffff0000111122223333');
  });

  it('первый ответ запоминается без тоста, следующий другой файл — тост со сменой хвоста', async () => {
    const first = '1111111111111111111111111111111111111111';
    const next = '2222222222222222222222222222222222222222';
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => tree(first) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => tree(next) } as Response);
    const apk = useApkBuildStore();
    await apk.refresh();
    expect(useToastStore().toast).toBeNull();
    expect(apk.updateIdle).toBe('1111111');

    await apk.refresh();
    expect(useToastStore().toast?.title).toBe('Новая сборка');
    expect(useToastStore().toast?.who).toBe('1111111 → 2222222');
    expect(apk.updateIdle).toBe('1111111 → 2222222');
  });

  it('повторный заход показывает тост снова, таймер — нет', async () => {
    const installed = '1111111111111111111111111111111111111111';
    const remote = '2222222222222222222222222222222222222222';
    localStorage.setItem('skyfi.apk-blob', installed);
    setActivePinia(createPinia());
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => tree(remote),
    } as Response);

    const apk = useApkBuildStore();
    await apk.refresh();
    expect(useToastStore().toast?.title).toBe('Новая сборка');

    useToastStore().hide();
    await apk.refresh();
    expect(useToastStore().toast).toBeNull();

    await apk.refresh(false, true);
    expect(useToastStore().toast?.title).toBe('Новая сборка');
    expect(useToastStore().toast?.who).toBe('1111111 → 2222222');
  });

  it('в браузере сборку не опрашиваем', async () => {
    native.value = false;
    setActivePinia(createPinia());
    const apk = useApkBuildStore();
    await apk.refresh();
    expect(fetch).not.toHaveBeenCalled();
    expect(apk.inApk).toBe(false);
  });
});
