import { watch } from 'vue';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';

/**
 * Тост при восстановлении связи: показываем один раз на переход
 * «офлайн → онлайн» (сам прячется через 5 с — ttl тоста в ките).
 * Первый переход null → true (бутстрэп) тостом не считаем.
 */
export function useOnlineRestoreToast() {
  const online = useOnlineStore();
  const toast = useToastStore();

  watch(
    () => online.isOnline,
    (value, previous) => {
      if (value === true && previous === false) {
        toast.show('Соединение восстановлено');
      }
    },
  );
}
