<template>
  <button
      type="button"
      role="menuitem"
      class="download-item"
      :disabled="downloading || !validTrackId"
      @click.stop="onDownload"
  >
    <ion-spinner v-if="downloading" name="crescent" />
    <ion-icon v-else :icon="downloadOutline" />

    <span>{{ downloading ? 'Подготовка...' : 'Скачать' }}</span>
  </button>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue';
import {IonIcon, IonSpinner} from '@ionic/vue';
import {downloadOutline} from 'ionicons/icons';
import {downloadTrackAudio} from '@/api/tracks';

const props = defineProps<{
  trackId: number;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const downloading = ref(false);

const validTrackId = computed(
    () => Number.isFinite(props.trackId) && props.trackId > 0,
);

function onDownload(): void {
  if (!validTrackId.value || downloading.value) {
    return;
  }

  // This endpoint returns the file itself with Content-Disposition: attachment.
  // Because this is a direct browser navigation, JavaScript does not need to
  // fetch the MP3 bytes, so the static-file CORS issue is avoided.
  downloading.value = true;
  // const downloadUrl = `http://127.0.0.1:8080/api/v1/skyfy/tracks/${props.trackId}/download`;
  window.location.href = downloadTrackAudio(props.trackId);
  emit('close');

  // Reset the button state in case navigation is not performed (e.g. an error).
  window.setTimeout(() => {
    downloading.value = false;
  }, 1500);
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