import { computed, defineComponent, ref } from 'vue';
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
import { useAuthStore } from '@/stores/auth';
import { useDownloadsStore } from '@/stores/downloads';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';

export default defineComponent({
  name: 'SettingsPage',
  components: { AppBar, AppConfirm, AppSheet, SeekBar, SettingRow, YandexCard, YoutubeCard, QrScannerSheet },
  setup() {
    const router = useRouter();
    const auth = useAuthStore();
    const { user } = storeToRefs(auth);
    const { volume } = storeToRefs(usePlayerStore());
    const toast = useToastStore();
    const sheet = ref<'name' | 'download' | null>(null);
    const scanOpen = ref(false);
    const draft = ref(user.value?.name ?? '');
    const avatarInput = ref<HTMLInputElement | null>(null);
    const avatarBusy = ref(false);
    const confirmClear = ref(false);
    const downloads = useDownloadsStore();
    const { items: downloadedItems, downloadedBytes } = storeToRefs(downloads);
    const hasDownloads = computed(() => downloadedItems.value.length > 0);
    const downloadedSize = computed(() => formatBytes(downloadedBytes.value));
    const builds = [
      { id: 'apk', title: 'Android · APK', idle: 'телефон, ТВ, магнитола' },
    ] as const;
    // /tree/ открывает страницу GitHub, raw отдаёт сам файл skyFy.apk из dev_v2.
    const APK_URL = 'https://github.com/Vlad06013/SkyFi_front/raw/dev_v2/skyFy.apk';

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
      window.open(APK_URL, '_blank', 'noopener');
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

    return {
      user,
      volume,
      sheet,
      scanOpen,
      draft,
      avatarInput,
      avatarBusy,
      confirmClear,
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
    };
  },
});
