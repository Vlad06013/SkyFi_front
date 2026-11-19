import { computed, defineComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
import { useYandexStore } from '@/stores/yandex';

export default defineComponent({
  name: 'YandexCard',
  setup() {
    const toast = useToastStore();
    const online = useOnlineStore();
    const yandex = useYandexStore();
    const { connected, awaiting, expired, userCode, verificationUrl, busy } = storeToRefs(yandex);

    /** Первый refresh не удался (офлайн/троттлинг) — показать «повторить». */
    const loadFailed = ref(false);

    const isLinked = computed(() => connected.value === true);

    const statusLine = computed(() => {
      if (connected.value === null && !loadFailed.value) return 'проверяем подключение…';
      if (awaiting.value) return 'ждём подтверждение';
      if (connected.value) return 'подключён';
      if (loadFailed.value) return 'не удалось загрузить';
      return 'не подключён';
    });

    async function refresh() {
      try {
        await yandex.refresh();
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

    function connect() {
      if (busy.value || guardOffline()) return;
      void yandex.connect().catch((error: unknown) => {
        toast.show(error instanceof Error ? error.message : 'Не удалось начать подключение', '', true);
      });
    }

    async function disconnect() {
      if (busy.value) return;
      try {
        await yandex.disconnect();
        toast.show('Яндекс Музыка', 'отключена');
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Не удалось отключить', '', true);
      }
    }

    async function copy(text: string | null, what: string) {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        toast.show(what, 'скопировано');
      } catch {
        toast.show(what, `не скопировано: ${text}`, true);
      }
    }

    // Подтверждение приходит поллингом — сообщаем, когда оно случилось.
    watch(connected, (now, was) => {
      if (now === true && was === false) toast.show('Яндекс Музыка', 'подключена');
    });

    onMounted(refresh);
    onBeforeUnmount(() => yandex.stopPolling());

    return {
      connected,
      awaiting,
      expired,
      userCode,
      verificationUrl,
      busy,
      loadFailed,
      isLinked,
      statusLine,
      refresh,
      connect,
      disconnect,
      copy,
    };
  },
});
