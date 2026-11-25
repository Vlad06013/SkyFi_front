import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { fetchAppUpdate } from '@/api/app-updates';
import { BUNDLE_VERSION, shellSemver } from '@/lib/bundle-version';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
import type { AppUpdatePayload } from '@/types/app-update';

const SHELL_INFO_TIMEOUT_MS = 1_500;

function errorDetail(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : '';
  return message.replace(/https?:\/\/\S+/g, (url) => {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return 'ссылка';
    }
  });
}

export const useAppUpdateStore = defineStore('app-update', () => {
  const inApk = Capacitor.isNativePlatform();
  const checking = ref(false);
  const downloading = ref(false);
  const progress = ref(0);
  const promptOpen = ref(false);
  const pending = ref<AppUpdatePayload | null>(null);
  const bundleId = ref<string | null>(null);

  const ready = computed(() => bundleId.value != null && pending.value != null);
  const mandatory = computed(() => pending.value?.mandatory === true);

  const idle = computed(() => {
    if (downloading.value) return `загрузка ${Math.round(progress.value)}%`;
    if (pending.value) return pending.value.version;
    return BUNDLE_VERSION;
  });

  const promptTitle = computed(() => {
    const version = pending.value?.version;
    if (!version) return 'Обновление';
    return mandatory.value ? `Нужно обновление ${version}` : `Обновить до ${version}?`;
  });

  const promptMessage = computed(() => {
    if (downloading.value) return `Загрузка ${Math.round(progress.value)}%`;
    return pending.value?.notes ?? '';
  });

  function fail(title: string, error?: unknown) {
    if (error !== undefined) console.error(title, error);
    useToastStore().show(title, error === undefined ? '' : errorDetail(error), true);
  }

  /** getInfo ходит в нативный мост. Если он молчит, проверка всё равно
   *  уходит на бэк — иначе кнопки нет в логе nginx. */
  async function shellVersion() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const info = await Promise.race([
        App.getInfo(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('версия оболочки не ответила')), SHELL_INFO_TIMEOUT_MS);
        }),
      ]);
      return shellSemver(info.version);
    } catch (error) {
      console.error('shell version', error);
      return '1.0.0';
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function download(update: AppUpdatePayload) {
    downloading.value = true;
    progress.value = 0;
    let events: { remove: () => Promise<void> } | undefined;
    try {
      events = await CapacitorUpdater.addListener('download', (state) => {
        progress.value = state.percent;
      });
      const bundle = await CapacitorUpdater.download({
        url: update.url,
        version: update.version,
        checksum: update.sha256,
      });
      bundleId.value = bundle.id;
      return true;
    } catch (error) {
      fail('Не удалось скачать обновление', error);
      return false;
    } finally {
      downloading.value = false;
      await events?.remove();
    }
  }

  /** manual — кнопка: тост, если бандл уже этой версии. Скачивание не
   *  начинается, пока пользователь не подтвердит диалог. */
  async function check(manual = false) {
    if (!inApk) return;
    if (checking.value || downloading.value) {
      if (manual) useToastStore().show('Проверка уже идёт');
      return;
    }
    checking.value = true;
    try {
      const update = await fetchAppUpdate(BUNDLE_VERSION, await shellVersion());
      if (!update) {
        pending.value = null;
        bundleId.value = null;
        promptOpen.value = false;
        if (manual) useToastStore().show('Обновлений нет', BUNDLE_VERSION);
        return;
      }
      if (pending.value?.version !== update.version) bundleId.value = null;
      pending.value = update;
      promptOpen.value = true;
    } catch (error) {
      fail('Не удалось проверить обновление', error);
    } finally {
      checking.value = false;
    }
  }

  async function accept() {
    const update = pending.value;
    if (!update || downloading.value) return;
    if (!bundleId.value) {
      const ok = await download(update);
      if (!ok) return;
    }
    const id = bundleId.value;
    if (!id) return;
    try {
      await CapacitorUpdater.set({ id });
    } catch (error) {
      fail('Не удалось установить обновление', error);
      promptOpen.value = true;
    }
  }

  function dismiss() {
    if (mandatory.value) return;
    promptOpen.value = false;
  }

  /** После входа и возврата сети. До сессии запрос не уходит (эндпоинт с токеном). */
  function bind() {
    if (!inApk) return;
    const auth = useAuthStore();
    const online = useOnlineStore();
    watch(
      () => [auth.isAuthed, online.isOnline] as const,
      ([authed, isOnline]) => {
        if (authed && isOnline) void check();
      },
      { immediate: true },
    );
  }

  return {
    inApk,
    checking,
    downloading,
    progress,
    promptOpen,
    pending,
    ready,
    mandatory,
    idle,
    promptTitle,
    promptMessage,
    check,
    accept,
    dismiss,
    bind,
  };
});
