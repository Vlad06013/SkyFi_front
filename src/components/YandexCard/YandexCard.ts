import { computed, defineComponent, onBeforeUnmount, ref } from 'vue';
import { useToastStore } from '@/stores/toast';

type YmState = 'connected' | 'idle' | 'starting' | 'awaiting' | 'importing' | 'done';

const ymCode = '111111';
const codeDelayMs = 1200;
const importStepPct = 4;
const importTickMs = 150;
const importTotal = 1248;

export default defineComponent({
  name: 'YandexCard',
  setup() {
    const toast = useToastStore();
    const ymState = ref<YmState>('connected');
    const codeDraft = ref('');
    const importPct = ref(0);
    let codeTimer: ReturnType<typeof setTimeout> | null = null;
    let importTimer: ReturnType<typeof setInterval> | null = null;

    const isLinked = computed(() =>
      ['connected', 'importing', 'done'].includes(ymState.value),
    );

    const statusLine = computed(() => {
      if (ymState.value === 'idle') return 'не подключён';
      if (ymState.value === 'starting') return 'получаем код…';
      if (ymState.value === 'awaiting') return 'ждём подтверждение';
      if (ymState.value === 'importing') return 'импортируем';
      if (ymState.value === 'done') return 'подключён · импортировано';
      return 'подключён';
    });

    const importCount = computed(() => Math.round((importTotal * importPct.value) / 100));

    function clearTimers() {
      if (codeTimer) {
        clearTimeout(codeTimer);
        codeTimer = null;
      }
      if (importTimer) {
        clearInterval(importTimer);
        importTimer = null;
      }
    }

    function disconnect() {
      clearTimers();
      ymState.value = 'idle';
      toast.show('Яндекс Музыка', 'отключена');
    }

    function requestCode() {
      clearTimers();
      ymState.value = 'starting';
      codeDraft.value = '';
      codeTimer = setTimeout(() => {
        ymState.value = 'awaiting';
      }, codeDelayMs);
    }

    function confirmCode() {
      if (codeDraft.value.trim() !== ymCode) {
        toast.show('Код не совпал', `введите ${ymCode}`);
        return;
      }
      ymState.value = 'connected';
      toast.show('Яндекс Музыка', 'подключена');
    }

    function startImport() {
      ymState.value = 'importing';
      importPct.value = 0;
      importTimer = setInterval(() => {
        importPct.value = Math.min(100, importPct.value + importStepPct);
        if (importPct.value >= 100 && importTimer) {
          clearInterval(importTimer);
          importTimer = null;
          ymState.value = 'done';
        }
      }, importTickMs);
    }

    function cancelImport() {
      clearTimers();
      ymState.value = 'connected';
      toast.show('Импорт', 'отменён');
    }

    function copied(what: string) {
      toast.show(what, 'скопировано');
    }

    onBeforeUnmount(clearTimers);

    return {
      ymState,
      ymCode,
      codeDraft,
      importPct,
      importCount,
      isLinked,
      statusLine,
      disconnect,
      requestCode,
      confirmCode,
      startImport,
      cancelImport,
      copied,
    };
  },
});
