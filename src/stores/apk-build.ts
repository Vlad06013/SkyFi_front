import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  clearInstalledBlob,
  clearPendingBlob,
  fetchApkBlob,
  openApkDownload,
  readInstalledBlob,
  readPendingBlob,
  readSeenBuild,
  settleInstall,
  shortBlob,
  writeInstalledBlob,
  writePendingBlob,
  writeSeenBuild,
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
  /** Один запрос на всех: таймер и заход в настройки не затирают друг друга. */
  let flight: Promise<string | null> | null = null;

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

  function forgetInstalled() {
    installedSha.value = null;
    clearInstalledBlob();
  }

  let adopted = false;

  /** Номер сборки Android: отмена загрузки его не меняет, установка — меняет. */
  async function adoptRunningBuild() {
    if (adopted || !inApk) return;
    let running = '';
    try {
      running = (await App.getInfo()).build;
    } catch {
      return;
    }
    if (!running) return;
    adopted = true;
    const next = settleInstall(
      { seenBuild: readSeenBuild(), pending: readPendingBlob(), installed: installedSha.value },
      running,
    );
    writeSeenBuild(next.seenBuild ?? running);
    clearPendingBlob();
    if (next.installed) remember(next.installed);
    else forgetInstalled();
  }

  function downloadApk() {
    openApkDownload();
    if (remoteSha.value) writePendingBlob(remoteSha.value);
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

  /** Скачать blob-sha. Пока запрос летит, повторный вызов ждёт его, а не выходит. */
  function pull(): Promise<string | null> {
    if (!inApk) return Promise.resolve(null);
    if (flight) return flight;
    flight = (async () => {
      checking.value = true;
      try {
        const sha = await fetchApkBlob();
        if (!sha) return null;
        remoteSha.value = sha;
        if (!installedSha.value) remember(sha);
        return sha;
      } catch {
        return null;
      } finally {
        checking.value = false;
        flight = null;
      }
    })();
    return flight;
  }

  /**
   * manual — кнопка «Проверить»: тост и когда сборка та же, и когда сеть молчит.
   * repeat — заход в настройки: тост «Новая сборка» снова, даже если таймер его уже показывал.
   * Обычный таймер тост не повторяет.
   */
  async function refresh(manual = false, repeat = false) {
    if (!inApk) return;
    await adoptRunningBuild();
    const sha = await pull();
    if (!sha) {
      if (manual) useToastStore().show('Не удалось проверить сборку', '', true);
      return;
    }
    const current = installedSha.value;
    if (!current || sha === current) {
      if (manual) useToastStore().show('Сборка актуальна', shortBlob(sha));
      return;
    }
    if (manual || repeat || announced !== sha) offerUpdate(sha);
  }

  function watchApk() {
    if (!inApk || timer) return;
    void refresh();
    timer = setInterval(() => void refresh(), CHECK_EVERY_MS);
  }

  return { inApk, checking, updateAvailable, updateIdle, downloadApk, refresh, watchApk };
});
