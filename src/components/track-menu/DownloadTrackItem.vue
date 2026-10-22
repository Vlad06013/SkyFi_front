<template>
  <button
      type="button"
      role="menuitem"
      class="download-item"
      @click.stop="onDownload"
  >
    <ion-icon :icon="downloadOutline" />

    <span>Скачать</span>
  </button>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue';
import { downloadOutline } from 'ionicons/icons';

const emit = defineEmits<{
    (event: 'close'): void;
}>();

function onDownload(): void {
    // Функционал скачивания трека появится позже.
    console.log('[SkyFi] Скачивание трека пока не реализовано.');

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

.download-item:hover,
.download-item:focus-visible {
    background: var(--ion-color-step-100, rgba(128, 128, 128, 0.12));
    outline: none;
}

.download-item ion-icon {
    flex: 0 0 auto;

    font-size: 18px;
    color: var(--ion-color-medium, #888);
}
</style>
