import { Capacitor } from '@capacitor/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  fetchApkBlob,
  openApkDownload,
  readInstalledBlob,
  shortBlob,
  writeInstalledBlob,
} from '@/lib/apk-build';
import { useToastStore } from '@/stores/toast';

/** Как часто смотреть, не сменился ли файл APK. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export const useApkBuildStore = defineStore('apk-build', () => {
  const inApk = Capacitor.isNativePlatform();
  const remoteSha = ref<string | null>(null);
  const installedSha = ref<string | null>(readInstalledBlob());
  const checking = ref(false);
  let announced = '';
  let timer: ReturnType<typeof setInterval> | null = null;

  const updateAvailable = computed(
    () => Boolean(installedSha.value && remoteSha.value && installedSha.value !== remoteSha.value),
  );

  const updateIdle = computed(() => {
    const remote = remoteSha.value;
    if (!remote) return 'сборка с GitHub';
    const next = shortBlob(remote);
    const current = installedSha.value;
    if (!current || current === remote) return next;
    return `${shortBlob(current)} → ${next}`;
  });

  function remember(sha: string) {
    installedSha.value = sha;
    writeInstalledBlob(sha);
  }

  function downloadApk() {
    openApkDownload();
    if (remoteSha.value) remember(remoteSha.value);
  }

  function offerUpdate(sha: string) {
    const current = installedSha.value;
    if (!current) return;
    announced = sha;
    useToastStore().show('Новая сборка', `${shortBlob(current)} → ${shortBlob(sha)}`, false, {
      label: 'Обновить',
      run: downloadApk,
    });
  }

  async function refresh(manual = false) {
    if (!inApk || checking.value) return;
    checking.value = true;
    try {
      const sha = await fetchApkBlob();
      if (!sha) {
        if (manual) useToastStore().show('Не удалось проверить сборку', '', true);
        return;
      }
      remoteSha.value = sha;
      if (!installedSha.value) {
        remember(sha);
        if (manual) useToastStore().show('Сборка актуальна', shortBlob(sha));
        return;
      }
      if (sha === installedSha.value) {
        if (manual) useToastStore().show('Сборка актуальна', shortBlob(sha));
        return;
      }
      if (manual || announced !== sha) offerUpdate(sha);
    } catch {
      if (manual) useToastStore().show('Не удалось проверить сборку', '', true);
    } finally {
      checking.value = false;
    }
  }

  function watchApk() {
    if (!inApk || timer) return;
    void refresh();
    timer = setInterval(() => void refresh(), CHECK_EVERY_MS);
  }

  return { inApk, checking, updateAvailable, updateIdle, downloadApk, refresh, watchApk };
});
