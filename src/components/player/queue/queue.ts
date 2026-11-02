import { computed, ref } from 'vue';
import usePlayerStore from '@/stores/player';
import {
    getPlayerQueue,
    removeTrackFromQueue,
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

    const visibleItems = computed(() =>
        [...queueItems.value].sort(
            (a, b) =>
                STATUS_RANK[a.status] - STATUS_RANK[b.status]
                || a.position - b.position,
        ),
    );

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

    return {
        player,
        loading,
        queueItems,
        visibleItems,
        removingIds,
        refreshQueue,
        removeQueueItem,
        playQueueTrack,
    };
}
