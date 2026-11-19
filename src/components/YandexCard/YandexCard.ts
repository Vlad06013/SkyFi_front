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
    const { connected, awaiting, expired, userCode, verificationUrl, busy, summary, progress, importActive } =
      storeToRefs(yandex);

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

    const importPct = computed(() => progress.value?.progress ?? 0);

    /** Числа как в макете: 1 248 через неразрывный пробел. */
    function fmt(n: number): string {
      return n.toLocaleString('ru-RU');
    }

    /** Счётчик секции: «5/515» — длинный вариант «5 из 515» не влезает в .ym-stat .n. */
    function fmtPair(section: { total: number; existing: number }): string {
      return `${fmt(section.existing)}/${fmt(section.total)}`;
    }
    const importDoneLine = computed(() => {
      if (progress.value?.status !== 'completed') return '';
      const parts = [`добавлено ${progress.value.imported}`, `пропущено ${progress.value.skipped}`];
      if (progress.value.failed > 0) parts.push(`ошибок ${progress.value.failed}`);
      return parts.join(' · ');
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

    function startImport() {
      if (busy.value || importActive.value || guardOffline()) return;
      void yandex.startImport().catch((error: unknown) => {
        toast.show(error instanceof Error ? error.message : 'Не удалось запустить импорт', '', true);
      });
    }

    async function cancelImport() {
      if (busy.value) return;
      try {
        await yandex.cancelImport();
      } catch (error) {
        toast.show(error instanceof Error ? error.message : 'Не удалось отменить импорт', '', true);
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

    // Финал джобы виден только если его ждали прямо на экране (не stale-запись прошлого входа).
    watch(
      () => progress.value?.status,
      (now, was) => {
        if (now === 'completed' && (was === 'queued' || was === 'running')) {
          toast.show('Импорт завершён', importDoneLine.value);
        }
      },
    );

    onMounted(refresh);
    onBeforeUnmount(() => {
      yandex.stopPolling();
      yandex.stopImportPolling();
    });

    return {
      connected,
      awaiting,
      expired,
      userCode,
      verificationUrl,
      busy,
      summary,
      progress,
      importActive,
      importPct,
      importDoneLine,
      fmt,
      fmtPair,
      loadFailed,
      isLinked,
      statusLine,
      refresh,
      connect,
      disconnect,
      startImport,
      cancelImport,
      copy,
    };
  },
});
