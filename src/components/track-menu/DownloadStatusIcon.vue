<template>
  <span
      v-if="status !== null"
      class="download-status-icon"
      :title="title"
  >
    <ion-spinner
        v-if="status === 'downloading'"
        name="crescent"
    />
    <ion-icon
        v-else
        :icon="arrowDownCircle"
    />

    <em v-if="status === 'downloading' && percent !== null">
      {{ percent }}%
    </em>
  </span>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {IonIcon, IonSpinner} from '@ionic/vue';
import {arrowDownCircle} from 'ionicons/icons';

import type {Track} from '@/types/TrackType';
import {useDownloadsStore} from '@/stores/downloads';

/**
 * Индикатор у меню трека (три точки): спиннер с процентом
 * во время скачивания, зелёная стрелка — трек скачан
 * для офлайна.
 */
const props = defineProps<{
  track: Track;
}>();

const downloads = useDownloadsStore();

const status = computed(() => downloads.statusOf(props.track));
const percent = computed(() => downloads.progressOf(props.track));

const title = computed(() =>
    status.value === 'downloading'
        ? 'Скачивается для офлайна'
        : 'Скачано для офлайна',
);
</script>

<style scoped>
.download-status-icon {
    display: inline-flex;
    align-items: center;
    gap: 3px;

    margin-right: 4px;

    color: #4ade80;
}

.download-status-icon ion-icon {
    font-size: 16px;
}

.download-status-icon ion-spinner {
    width: 13px;
    height: 13px;

    color: #c4b5fd;
}

.download-status-icon em {
    font-size: 10px;
    font-style: normal;
    color: #9296a7;
}
</style>
