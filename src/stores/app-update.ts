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

  async function shellVersion() {
    try {
      return shellSemver((await App.getInfo()).version);
    } catch {
      return '1.0.0';
    }
  }

  async function download(update: AppUpdatePayload) {
    downloading.value = true;
    progress.value = 0;
    if (update.mandatory) promptOpen.value = true;
    const events = await CapacitorUpdater.addListener('download', (state) => {
      progress.value = state.percent;
    });
    try {
      const bundle = await CapacitorUpdater.download({
        url: update.url,
        version: update.version,
        checksum: update.sha256,
      });
      bundleId.value = bundle.id;
      promptOpen.value = true;
    } catch {
      pending.value = null;
      promptOpen.value = false;
      useToastStore().show('Не удалось скачать обновление', '', true);
    } finally {
      downloading.value = false;
      await events.remove();
    }
  }

  /** manual — кнопка: тост, если бандл уже этой версии или сеть молчит. */
  async function check(manual = false) {
    if (!inApk || checking.value || downloading.value) return;
    checking.value = true;
    try {
      const update = await fetchAppUpdate(BUNDLE_VERSION, await shellVersion());
      if (!update) {
        pending.value = null;
        bundleId.value = null;
        if (manual) useToastStore().show('Обновлений нет', BUNDLE_VERSION);
        return;
      }
      if (bundleId.value && pending.value?.version === update.version) {
        promptOpen.value = true;
        return;
      }
      pending.value = update;
      bundleId.value = null;
      await download(update);
    } catch {
      if (manual) useToastStore().show('Не удалось проверить обновление', '', true);
    } finally {
      checking.value = false;
    }
  }

  async function apply() {
    const id = bundleId.value;
    if (!id) return;
    try {
      await CapacitorUpdater.set({ id });
    } catch {
      useToastStore().show('Не удалось установить обновление', '', true);
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
    apply,
    dismiss,
    bind,
  };
});
