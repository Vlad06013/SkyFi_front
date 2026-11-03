import { computed, ref } from 'vue';
import usePlayerStore from '@/stores/player';
import {
    getPlayerQueue,
    removeTrackFromQueue,
    reorderPlayerQueue,
} from '@/api/queue';

import { PlaybackQueueItem } from '@/types/QueueType';

/** Порядок показа: играющий первым, затем ожидающие,
 *  прослушанные/пропущенные в конец. */
const STATUS_RANK: Record<PlaybackQueueItem['status'], number> = {
    playing_now: 0,
    pending: 1,
    played: 2,
    skipped: 2,
};

export function useQueue() {
    const player = usePlayerStore();

    const loading = ref(false);
    const queueItems = ref<PlaybackQueueItem[]>([]);
    const removingIds = ref(new Set<number>());
    const reordering = ref(false);

    const visibleItems = computed(() =>
        [...queueItems.value].sort(
            (a, b) =>
                STATUS_RANK[a.status] - STATUS_RANK[b.status]
                || a.position - b.position,
        ),
    );

    /** Ожидающие треки в порядке позиций — их можно переставлять. */
    const pendingItems = computed(() =>
        visibleItems.value.filter(
            (item) => item.status === 'pending',
        ),
    );

    /** Индекс ожидающего трека в списке (для кнопок вверх/вниз). */
    function pendingIndex(item: PlaybackQueueItem): number {
        return pendingItems.value.findIndex(
            (queueItem) => queueItem.id === item.id,
        );
    }

    function applyQueue(items: PlaybackQueueItem[]): void {
        queueItems.value = items;
        player.setServerQueueCount(items.length);
        player.setQueue(
            items.map(item => item.track),
        );
    }

    async function playQueueTrack(
        item: PlaybackQueueItem,
    ): Promise<void> {
        if (item.status !== 'pending') return;

        await player.playServerQueueItem(item);

        // Статус элемента обновился на сервере —
        // подтянем свежую очередь.
        void refreshQueue();
    }

    async function refreshQueue(): Promise<void> {
        if (loading.value || !player.isServerSyncEnabled) {
            return;
        }

        loading.value = true;

        try {
            applyQueue(await getPlayerQueue());
        } catch (error) {
            console.error(
                '[QueuePanel] Не удалось загрузить очередь:',
                error,
            );
        } finally {
            loading.value = false;
        }
    }

    async function removeQueueItem(
        queueItemId: number,
    ): Promise<void> {
        if (
            removingIds.value.has(queueItemId)
            || !player.isServerSyncEnabled
        ) {
            return;
        }

        removingIds.value = new Set([
            ...removingIds.value,
            queueItemId,
        ]);

        try {
            // Ответ уже содержит очередь целиком —
            // отдельно запрашивать её не нужно.
            applyQueue(await removeTrackFromQueue(queueItemId));
        } catch (error) {
            console.error(
                '[QueuePanel] Не удалось удалить трек:',
                error,
            );
        } finally {
            const next = new Set(removingIds.value);
            next.delete(queueItemId);
            removingIds.value = next;
        }
    }

    /**
     * Сдвинуть ожидающий трек на одну позицию вверх/вниз.
     * Бэкенду передаём ID всех ожидающих элементов в новом порядке.
     */
    async function moveQueueItem(
        item: PlaybackQueueItem,
        direction: -1 | 1,
    ): Promise<void> {
        if (
            reordering.value
            || !player.isServerSyncEnabled
            || item.status !== 'pending'
        ) {
            return;
        }

        const ids = pendingItems.value.map(
            (queueItem) => queueItem.id,
        );
        const index = ids.indexOf(item.id);
        const targetIndex = index + direction;

        if (index === -1 || targetIndex < 0 || targetIndex >= ids.length) {
            return;
        }

        [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];

        reordering.value = true;

        try {
            // Ответ уже содержит очередь целиком —
            // отдельно запрашивать её не нужно.
            applyQueue(await reorderPlayerQueue(ids));
        } catch (error) {
            console.error(
                '[QueuePanel] Не удалось изменить порядок:',
                error,
            );
            await refreshQueue();
        } finally {
            reordering.value = false;
        }
    }

    return {
        player,
        loading,
        queueItems,
        visibleItems,
        pendingItems,
        removingIds,
        reordering,
        refreshQueue,
        removeQueueItem,
        playQueueTrack,
        moveQueueItem,
        pendingIndex,
    };
}
