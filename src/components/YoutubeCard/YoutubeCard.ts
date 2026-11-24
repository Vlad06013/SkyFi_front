import { computed, defineComponent, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
import { useYoutubeStore } from '@/stores/youtube';

export default defineComponent({
  name: 'YoutubeCard',
  setup() {
    const toast = useToastStore();
    const online = useOnlineStore();
    const youtube = useYoutubeStore();
    const { hasCookies, updatedAt, busy } = storeToRefs(youtube);

    /** Первый refresh не удался (офлайн/троттлинг) — показать «повторить». */
    const loadFailed = ref(false);
    /** Подсказка «как достать cookies» — свёрнута по умолчанию. */
    const hintOpen = ref(false);
    const fileInput = ref<HTMLInputElement | null>(null);

    const isLinked = computed(() => hasCookies.value === true);

    const statusLine = computed(() => {
      if (hasCookies.value === null && !loadFailed.value) return 'проверяем статус…';
      if (loadFailed.value) return 'не удалось загрузить';
      return hasCookies.value ? 'cookies загружены' : 'cookies не загружены';
    });

    const updatedLabel = computed(() => {
      const raw = updatedAt.value;
      if (!raw) return '';
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return raw;
      return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    });

    async function refresh() {
      try {
        await youtube.refresh();
        loadFailed.value = false;
      } catch {
        loadFailed.value = true;
      }
    }

    function guardOffline(): boolean {
      if (online.isOnline !== false) return false;
      toast.show('Нет соединения с сервером', '', true);
      return true;
    }

    function pickFile() {
      fileInput.value?.click();
    }

    async function onFilePicked() {
      const input = fileInput.value;
      const file = input?.files?.[0];
      if (input) input.value = '';
      if (!file || busy.value || guardOffline()) return;
      if (!file.name.toLowerCase().endsWith('.txt')) {
        toast.show('Нужен файл .txt', 'cookies выгружаются в этом формате', true);
        return;
      }
      try {
        await youtube.upload(file);
        toast.show('YouTube', 'cookies загружены');
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Не удалось загрузить cookies', '', true);
      }
    }

    async function remove() {
      if (busy.value || guardOffline()) return;
      try {
        await youtube.remove();
        toast.show('YouTube', 'cookies удалены');
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Не удалось удалить cookies', '', true);
      }
    }

    onMounted(refresh);

    return {
      hasCookies,
      updatedAt,
      busy,
      loadFailed,
      hintOpen,
      fileInput,
      isLinked,
      statusLine,
      updatedLabel,
      refresh,
      pickFile,
      onFilePicked,
      remove,
    };
  },
});
