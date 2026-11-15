<template>
  <button
      type="button"
      role="menuitem"
      class="download-item"
      :disabled="status === 'downloading'"
      @click.stop="onAction"
  >
    <ion-spinner
        v-if="status === 'downloading'"
        name="crescent"
    />
    <ion-icon
        v-else
        :icon="icon"
    />

    <span>{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {IonIcon, IonSpinner} from '@ionic/vue';
import {
  cloudDownloadOutline,
  refreshOutline,
  trashOutline,
} from 'ionicons/icons';

import type {Track} from '@/types/TrackType';
import {useDownloadsStore} from '@/stores/downloads';

/**
 * Скачать трек для офлайна / удалить скачанное.
 * Независимо от избранного: скачивание ≠ лайк,
 * удаление скачанного избранное не трогает.
 */
const props = defineProps<{
  track: Track;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const downloads = useDownloadsStore();

const status = computed(() => downloads.statusOf(props.track));

const percent = computed(() => downloads.progressOf(props.track));

const label = computed(() => {
  switch (status.value) {
    case 'downloading':
      return percent.value !== null
          ? `Скачивается… ${percent.value}%`
          : 'Скачивается…';
    case 'done':
      return 'Удалить';
    case 'error':
      return 'Повторить скачивание';
    default:
      return 'Скачать';
  }
});

const icon = computed(() => {
  switch (status.value) {
    case 'done':
      return trashOutline;
    case 'error':
      return refreshOutline;
    default:
      return cloudDownloadOutline;
  }
});

function onAction(): void {
  if (status.value === 'downloading') {
    return;
  }

  if (status.value === 'done') {
    void downloads.remove(props.track);
  } else {
    void downloads.download(props.track);
  }

  emit('close');
}
</script>

<style scoped>
.download-item {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--ion-text-color, #f5f7fa);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.download-item:hover:not(:disabled),
.download-item:focus-visible {
  background: var(--ion-color-step-100, rgba(128, 128, 128, 0.12));
  outline: none;
}

.download-item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.download-item ion-icon,
.download-item ion-spinner {
  flex: 0 0 auto;
  font-size: 18px;
  color: var(--ion-color-medium, #888);
}
</style>
