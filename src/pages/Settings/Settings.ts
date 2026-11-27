import { computed, defineComponent, onActivated, ref } from 'vue';
import { usePageRefresh } from '@/composables/usePageRefresh';
import { useYandexStore } from '@/stores/yandex';
import { useYoutubeStore } from '@/stores/youtube';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import AppConfirm from '@/components/AppConfirm/AppConfirm.vue';
import AppSheet from '@/components/AppSheet/AppSheet.vue';
import SeekBar from '@/components/SeekBar/SeekBar.vue';
import SettingRow from '@/components/SettingRow/SettingRow.vue';
import YandexCard from '@/components/YandexCard/YandexCard.vue';
import YoutubeCard from '@/components/YoutubeCard/YoutubeCard.vue';
import QrScannerSheet from '@/components/QrScannerSheet/QrScannerSheet.vue';
import { useApkBuildStore } from '@/stores/apk-build';
import { useAppUpdateStore } from '@/stores/app-update';
import { useAuthStore } from '@/stores/auth';
import { useLayoutStore } from '@/stores/layout';
import type { LayoutProfile } from '@/lib/layout-profile';
import { resolveUrl } from '@/lib/endpoints';
import { useDownloadsStore } from '@/stores/downloads';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import { clearNetLog, formatNetLog, netEventLabel, netLog, type NetLogEntry } from '@/lib/net-log';

export default defineComponent({
  name: 'SettingsPage',
  components: { AppBar, AppConfirm, AppSheet, SeekBar, SettingRow, YandexCard, YoutubeCard, QrScannerSheet },
  setup() {
    const router = useRouter();
    const auth = useAuthStore();
    const { user } = storeToRefs(auth);
    const { volume } = storeToRefs(usePlayerStore());
    const toast = useToastStore();
    const sheet = ref<'name' | 'download' | 'netlog' | null>(null);
    const sheetTitle = computed(() => {
      if (sheet.value === 'name') return 'Имя';
      if (sheet.value === 'netlog') return 'Диагностика сети';
      return 'Скачать SkyFi';
    });
    const scanOpen = ref(false);
    const draft = ref(user.value?.name ?? '');
    const avatarInput = ref<HTMLInputElement | null>(null);
    const avatarBusy = ref(false);
    const confirmClear = ref(false);
    const yandex = useYandexStore();
    const youtube = useYoutubeStore();
    usePageRefresh(() =>
      Promise.all([
        auth.restoreSession({ refresh: true }),
        yandex.refresh().catch(() => undefined),
        youtube.refresh().catch(() => undefined),
      ]),
    );

    const apk = useApkBuildStore();
    const updates = useAppUpdateStore();
    const { idle: updateIdle, ready: updateReady, checking: updateChecking, downloading: updateDownloading } = storeToRefs(updates);
    // Вкладка живёт в keep-alive: onActivated — каждый заход, не только первый.
    onActivated(() => {
      void updates.check();
    });
    const layout = useLayoutStore();
    const { profile: layoutProfile, options: layoutOptions } = storeToRefs(layout);
    async function setLayout(next: LayoutProfile) {
      await layout.setProfile(next);
    }

    const downloads = useDownloadsStore();
    const { items: downloadedItems, downloadedBytes } = storeToRefs(downloads);
    const hasDownloads = computed(() => downloadedItems.value.length > 0);
    const downloadedSize = computed(() => formatBytes(downloadedBytes.value));
    const builds = [
      { id: 'apk', title: 'Android · APK', idle: 'телефон, ТВ, магнитола' },
    ] as const;
    function openName() {
      draft.value = user.value?.name ?? '';
      sheet.value = 'name';
    }

    function pickAvatar() {
      if (avatarBusy.value) return;
      avatarInput.value?.click();
    }

    async function onAvatarPicked() {
      const file = avatarInput.value?.files?.[0];
      if (!file) return;
      avatarBusy.value = true;
      try {
        await auth.uploadAvatar(file);
        toast.show('Фото', 'обновлено');
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Не удалось загрузить фото', '', true);
      } finally {
        avatarBusy.value = false;
        if (avatarInput.value) avatarInput.value.value = '';
      }
    }

    async function saveName() {
      const name = draft.value.trim();
      if (!name) return;
      try {
        await auth.rename(name);
        sheet.value = null;
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Не удалось сохранить имя', '', true);
      }
    }

    function downloadBuild() {
      sheet.value = null;
      apk.downloadApk();
    }

    function formatBytes(bytes: number): string {
      if (bytes < 1024 * 1024) {
        const kb = Math.max(1, Math.round(bytes / 1024));
        return `${kb} КБ`;
      }
      const mb = bytes / (1024 * 1024);
      if (mb < 1024) return `${mb.toFixed(1).replace('.', ',')} МБ`;
      const gb = mb / 1024;
      return `${gb.toFixed(1).replace('.', ',')} ГБ`;
    }

    function askClearDownloads() {
      if (!hasDownloads.value) return;
      confirmClear.value = true;
    }

    async function clearDownloads() {
      confirmClear.value = false;
      await downloads.clearDownloads();
      toast.show('Скачанное', 'удалено');
    }

    async function logout() {
      await auth.logout();
      await router.replace('/login');
    }

    function onScanned(code: string) {
      scanOpen.value = false;
      void router.push({ path: '/qr-confirm', query: { code } });
    }

    // Журнал сетевых событий (коннекты/разрывы сокета, переходы
    // онлайн-стейта) — новые сверху: флап ловим на устройстве,
    // консоль WebView недоступна.
    const netlog = computed(() => [...netLog.value].reverse());

    function netlogTime(at: number) {
      const date = new Date(at);
      const pad = (value: number) => String(value).padStart(2, '0');
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    function netlogStatus(entry: NetLogEntry) {
      return entry.transition ?? netEventLabel(entry.event);
    }

    async function copyNetlog() {
      try {
        await navigator.clipboard.writeText(formatNetLog(netLog.value));
        toast.show('Диагностика', 'журнал скопирован');
      } catch {
        toast.show('Не удалось скопировать журнал', '', true);
      }
    }

    function clearNetlog() {
      clearNetLog();
    }

    return {
      user,
      volume,
      sheet,
      sheetTitle,
      scanOpen,
      draft,
      avatarInput,
      avatarBusy,
      confirmClear,
      resolveUrl,
      inApk: updates.inApk,
      updateIdle,
      updateReady,
      updateBusy: computed(() => updateChecking.value || updateDownloading.value),
      checkUpdate: () => void updates.check(true),
      hasDownloads,
      downloadedSize,
      builds,
      openName,
      pickAvatar,
      onAvatarPicked,
      saveName,
      downloadBuild,
      askClearDownloads,
      clearDownloads,
      logout,
      onScanned,
      layoutProfile,
      layoutOptions,
      setLayout,
      netlog,
      netlogTime,
      netlogStatus,
      copyNetlog,
      clearNetlog,
    };
  },
});
