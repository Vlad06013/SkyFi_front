import { defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import AppSheet from '@/components/AppSheet/AppSheet.vue';
import SeekBar from '@/components/SeekBar/SeekBar.vue';
import SettingRow from '@/components/SettingRow/SettingRow.vue';
import YandexCard from '@/components/YandexCard/YandexCard.vue';
import QrScannerSheet from '@/components/QrScannerSheet/QrScannerSheet.vue';
import { useAuthStore } from '@/stores/auth';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';

export default defineComponent({
  name: 'SettingsPage',
  components: { AppBar, AppSheet, SeekBar, SettingRow, YandexCard, QrScannerSheet },
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
    const appLatest = ref(false);
    const downloadedGb = ref(1.2);
    const builds = [
      { id: 'apk', title: 'Android · APK', idle: 'телефон, ТВ, магнитола' },
      { id: 'linux', title: 'Linux', idle: 'AppImage' },
      { id: 'windows', title: 'Windows', idle: 'установщик' },
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

    function updateApp() {
      appLatest.value = true;
      toast.show('SkyFi 1.5.0', 'обновлено');
    }

    function downloadBuild(title: string) {
      sheet.value = null;
      toast.show(title, 'скачиваем');
    }

    function clearDownloads() {
      downloadedGb.value = 0;
      toast.show('Скачанное', 'очищено');
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
      appLatest,
      downloadedGb,
      builds,
      openName,
      pickAvatar,
      onAvatarPicked,
      saveName,
      updateApp,
      downloadBuild,
      clearDownloads,
      logout,
      onScanned,
    };
  },
});
