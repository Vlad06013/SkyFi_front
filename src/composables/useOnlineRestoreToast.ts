import { watch } from 'vue';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';

/**
 * Тосты сети на весь экран (сами прячутся через 5 с).
 * Офлайн — любой вход в false, включая первую проверку.
 * «Соединение восстановлено» — только офлайн → онлайн;
 * первый переход null → true тостом не считаем.
 */
export function useOnlineRestoreToast() {
  const online = useOnlineStore();
  const toast = useToastStore();

  watch(
    () => online.isOnline,
    (value, previous) => {
      if (value === false && previous !== false) {
        toast.show('Офлайн-режим');
        return;
      }
      if (value === true && previous === false) {
        toast.show('Соединение восстановлено');
      }
    },
  );
}
