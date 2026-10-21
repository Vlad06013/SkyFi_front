```vue
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
          <p>{{ player.queue.length }} треков в очереди</p>
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
        <span class="queue-section-label">СЛЕДУЮЩИЕ ТРЕКИ</span>

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
            v-for="(track, index) in player.queue"
            :key="`${track.id}-${index}`"
            class="queue-track"
        >
          <span class="queue-index">{{ index + 1 }}</span>

          <div class="queue-cover">
            ♫
          </div>

          <div class="queue-track-info">
            <strong>{{ track.title }}</strong>
            <span>
              {{
                track.artists?.map(artist => artist.name).join(', ')
                || 'Неизвестный исполнитель'
              }}
            </span>
          </div>
        </div>

        <div
            v-if="player.queue.length === 0"
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
import { ref } from 'vue';
import usePlayerStore from '@/stores/player';
import { getPlayerQueue } from '@/api/tracks';

defineProps<{
  open: boolean;
}>();

defineEmits<{
  close: [];
}>();

const player = usePlayerStore();
const loading = ref(false);

async function refreshQueue(): Promise<void> {
  if (loading.value || !player.isServerSyncEnabled) return;

  loading.value = true;

  try {
    const response = await getPlayerQueue();
    player.setQueue(response.data.map(item => item.track));
  } catch (error) {
    console.error(
        '[QueuePanel] Не удалось загрузить очередь:',
        error,
    );
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.queue-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}

.queue-panel {
  position: absolute;
  top: 24px;
  right: 24px;
  bottom: 108px;

  display: flex;
  flex-direction: column;

  width: min(520px, calc(100vw - 48px));
  max-height: calc(100vh - 132px);
  overflow: hidden;

  border: 1px solid #ffffff18;
  border-radius: 20px;

  background: #191824;
  color: #f5f3fa;

  box-shadow: 0 18px 60px #0007;
}

.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  flex-shrink: 0;
  padding: 22px 24px 20px;

  border-bottom: 1px solid #ffffff12;
}

.queue-header h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
}

.queue-header p {
  margin: 7px 0 0;
  color: #a09db2;
  font-size: 13px;
}

.queue-close {
  display: grid;
  place-items: center;
  flex-shrink: 0;

  width: 38px;
  height: 38px;
  border: 1px solid #ffffff12;
  border-radius: 10px;

  background: #ffffff08;
  color: #c8c2d8;

  font-size: 18px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.queue-close:hover {
  background: #ffffff14;
  color: #ffffff;
}

.queue-next-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  flex-shrink: 0;
  padding: 18px 24px 12px;
}

.queue-section-label {
  color: #a09db2;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.queue-refresh {
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;

  background: transparent;
  color: #b8a2ff;

  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.queue-refresh:hover:not(:disabled) {
  background: #b8a2ff14;
}

.queue-refresh:disabled {
  opacity: 0.5;
  cursor: wait;
}

.queue-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;

  padding: 4px 16px 20px;
  scrollbar-width: thin;
  scrollbar-color: #514565 transparent;
}

.queue-track {
  display: flex;
  align-items: center;
  gap: 14px;

  min-width: 0;
  padding: 12px 8px;

  border-radius: 12px;
  transition: background 0.15s;
}

.queue-track:hover {
  background: #ffffff08;
}

.queue-index {
  flex-shrink: 0;
  width: 24px;

  color: #9995aa;
  font-size: 13px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.queue-cover {
  display: grid;
  place-items: center;
  flex-shrink: 0;

  width: 54px;
  height: 54px;
  border-radius: 10px;

  background: linear-gradient(135deg, #7658bc, #32244e);
  color: #ffffff;

  font-size: 25px;
}

.queue-track-info {
  flex: 1;
  min-width: 0;
  padding-right: 4px;
}

.queue-track-info strong,
.queue-track-info span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-track-info strong {
  color: #f5f3fa;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

.queue-track-info span {
  margin-top: 4px;
  color: #a09db2;
  font-size: 12px;
  line-height: 1.4;
}

.queue-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  padding: 64px 20px;

  color: #a09db2;
  text-align: center;
  font-size: 13px;
}

.queue-empty strong {
  color: #e4e0ef;
  font-size: 15px;
}

.queue-empty p {
  margin: 0;
  line-height: 1.5;
}

.queue-empty-icon {
  color: #b8a2ff;
  font-size: 42px;
}

@media (max-width: 700px) {
  .queue-backdrop {
    background: #191824;
    backdrop-filter: none;
  }

  .queue-panel {
    position: fixed;
    inset: 0;

    display: flex;
    flex-direction: column;

    width: 100%;
    height: 100%;
    height: 100dvh;
    max-height: none;

    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    box-sizing: border-box;

    border: none;
    border-radius: 0;
    overflow: hidden;

    background: #191824;
  }

  .queue-header {
    flex-shrink: 0;
    padding: 18px 18px 16px;
  }

  .queue-header h2 {
    font-size: 18px;
  }

  .queue-next-header {
    flex-shrink: 0;
    padding: 16px 18px 10px;
  }

  .queue-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;

    padding: 4px 12px 20px;
  }

  .queue-track {
    gap: 12px;
    padding: 12px 6px;
  }

  .queue-cover {
    width: 50px;
    height: 50px;
    border-radius: 9px;
    font-size: 23px;
  }

  .queue-track-info strong {
    font-size: 14px;
  }

  .queue-track-info span {
    font-size: 12px;
  }
}
</style>
