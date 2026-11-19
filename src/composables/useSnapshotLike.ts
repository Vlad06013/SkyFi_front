import { computed } from 'vue';
import { useFavoritesStore } from '@/stores/favorites';
import { useToastStore } from '@/stores/toast';
import type { AnySnapshot } from '@/types';

export function useSnapshotLike(source: () => AnySnapshot | null | undefined) {
  const favorites = useFavoritesStore();
  const toast = useToastStore();

  const liked = computed(() => favorites.has(source()));

  function toggleLike() {
    const snapshot = source();
    if (!snapshot) return;
    void favorites
      .toggle(snapshot)
      .then((added) => {
        toast.show(snapshot.title, added ? 'добавлено в избранное' : 'убрано из избранного');
      })
      .catch((error: unknown) => {
        toast.show(error instanceof Error ? error.message : 'Не удалось обновить избранное', '', true);
      });
  }

  return { liked, toggleLike };
}
