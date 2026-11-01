import { ref, watch } from 'vue';
import usePlayerStore from '@/stores/player';
import {
    getPlayerQueue,
    removeTrackFromQueue,
} from '@/api/queue';

import { PlaybackQueueItem } from '@/types/QueueType';
export function useQueue() {
    const player = usePlayerStore();

    const loading = ref(false);
    const queueItems = ref<PlaybackQueueItem[]>([]);
    const removingIds = ref(new Set<number>());

    function applyQueue(items: PlaybackQueueItem[]): void {
        queueItems.value = items;
        player.setServerQueueCount(items.length);
        player.setQueue(
            items.map(item => item.track),
        );
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
        removingIds,
        refreshQueue,
        removeQueueItem,
    };
}
