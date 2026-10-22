import { ref, watch } from 'vue';
import usePlayerStore from '@/stores/player';
import {
    getPlayerQueue,
    removeTrackFromQueue,
    type PlaybackQueueItem,
} from '@/api/queue';

export function useQueue() {
    const player = usePlayerStore();

    const loading = ref(false);
    const queueItems = ref<PlaybackQueueItem[]>([]);
    const removingIds = ref(new Set<number>());

    async function refreshQueue(): Promise<void> {
        if (loading.value || !player.isServerSyncEnabled) {
            return;
        }

        loading.value = true;

        try {
            const response = await getPlayerQueue();

            queueItems.value = response.data;

            player.setQueue(
                response.data.map(item => item.track),
            );
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
            await removeTrackFromQueue(queueItemId);
            await refreshQueue();
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
