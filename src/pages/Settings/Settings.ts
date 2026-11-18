import { defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import SeekBar from '@/components/SeekBar/SeekBar.vue';
import SettingRow from '@/components/SettingRow/SettingRow.vue';
import { useAuthStore } from '@/stores/auth';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';

export default defineComponent({
  name: 'SettingsPage',
  components: { AppBar, SeekBar, SettingRow },
  setup() {
    const router = useRouter();
    const auth = useAuthStore();
    const { user } = storeToRefs(auth);
    const { volume } = storeToRefs(usePlayerStore());
    const toast = useToastStore();
    const sheet = ref<'name' | 'download' | null>(null);
    const draft = ref(user.value?.name ?? '');
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

    function saveName() {
      const name = draft.value.trim();
      if (name) auth.rename(name);
      sheet.value = null;
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

    function logout() {
      auth.logout();
      router.push('/login');
    }

    return {
      user,
      volume,
      sheet,
      draft,
      appLatest,
      downloadedGb,
      builds,
      openName,
      saveName,
      updateApp,
      downloadBuild,
      clearDownloads,
      logout,
    };
  },
});
