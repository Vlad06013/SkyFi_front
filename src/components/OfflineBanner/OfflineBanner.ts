import { computed, defineComponent } from 'vue';
import { useOnlineStore } from '@/stores/online';

export default defineComponent({
  name: 'OfflineBanner',
  setup() {
    const online = useOnlineStore();
    // null — первой проверки ещё не было (сплэш), баннер не показываем.
    const isOffline = computed(() => online.isOnline === false);
    return { isOffline };
  },
});
