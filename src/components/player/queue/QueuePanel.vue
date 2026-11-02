<template>
  <div
      v-if="open"
      class="queue-backdrop"
      @click.self="$emit('close')"
  >
    <section
        class="queue-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Очередь воспроизведения"
    >
      <header class="queue-header">
        <div>
          <h2>Очередь воспроизведения</h2>
          <p>{{ queueItems.length }} треков в очереди</p>
        </div>

        <button
            type="button"
            class="queue-close"
            aria-label="Закрыть очередь"
            @click="$emit('close')"
        >
          ✕
        </button>
      </header>

      <div class="queue-next-header">
        <span class="queue-section-label">
          СЛЕДУЮЩИЕ ТРЕКИ
        </span>

        <button
            type="button"
            class="queue-refresh"
            :disabled="loading || !player.isServerSyncEnabled"
            @click="refreshQueue"
        >
          {{ loading ? 'Загрузка…' : 'Обновить' }}
        </button>
      </div>

      <div class="queue-list">
        <div
            v-for="(item, index) in visibleItems"
            :key="item.id"
            class="queue-track"
            :class="`queue-track-${item.status}`"
            :role="item.status === 'pending' ? 'button' : undefined"
            :tabindex="item.status === 'pending' ? 0 : undefined"
            @click="item.status === 'pending' && playQueueTrack(item)"
            @keydown.enter="item.status === 'pending' && playQueueTrack(item)"
        >
          <span class="queue-index">
            <template v-if="item.status === 'playing_now'">▶</template>
            <template v-else>{{ index + 1 }}</template>
          </span>

          <div class="queue-cover">
            ♫
          </div>

          <div class="queue-track-info">
            <strong>{{ item.track.title }}</strong>

            <span>
              {{
                item.track.meta?.artists
                    ?.map(artist => artist.name)
                    .join(', ')
                || 'Неизвестный исполнитель'
              }}
            </span>
          </div>

          <span
              v-if="item.status === 'playing_now'"
              class="queue-status-label"
          >
            Сейчас играет
          </span>

          <button
              type="button"
              class="queue-remove"
              :disabled="
              removingIds.has(item.id)
              || !player.isServerSyncEnabled
            "
              :aria-label="`Удалить ${item.track.title} из очереди`"
              title="Удалить из очереди"
              @click.stop="removeQueueItem(item.id)"
          >
            {{
              removingIds.has(item.id)
                  ? '…'
                  : '✕'
            }}
          </button>
        </div>

        <div
            v-if="queueItems.length === 0 && !loading"
            class="queue-empty"
        >
          <span class="queue-empty-icon">♫</span>
          <strong>Очередь пока пуста</strong>
          <p>Добавь треки через меню библиотеки.</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import './queue.css';
import { watch } from 'vue';
import { useQueue } from './queue';

const props = defineProps<{
  open: boolean;
}>();

defineEmits<{
  close: [];
}>();

const {
  player,
  loading,
  queueItems,
  visibleItems,
  removingIds,
  refreshQueue,
  removeQueueItem,
  playQueueTrack,
} = useQueue();

watch(
    () => props.open,
    (isOpen) => {
      if (isOpen) {
        void refreshQueue();
      }
    },
    { immediate: true },
);
</script>
