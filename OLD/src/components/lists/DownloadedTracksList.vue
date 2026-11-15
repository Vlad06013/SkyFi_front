<template>
  <div
      v-if="items.length === 0"
      class="downloads-empty"
  >
    <p>Нет скачанных треков.</p>

    <p class="downloads-hint">
      Открой меню трека (три точки) → «Скачать для офлайна» —
      и музыка заиграет даже без сети.
    </p>
  </div>

  <div v-else>
    <div
        v-for="record in items"
        :key="record.key"
        class="track-row"
        role="button"
        tabindex="0"
        :aria-label="`Воспроизвести: ${record.track.title}`"
        :class="{
          'track-row-active': isCurrentTrack(record.track),
        }"
        @click="playTrack(record.track)"
        @keydown.enter.prevent="playTrack(record.track)"
    >
      <button
          type="button"
          tabindex="-1"
          class="uploaded-track-play"
          :aria-label="`Воспроизвести ${record.track.title}`"
          @click.stop="playTrack(record.track)"
      >
        <div class="cover cover-downloaded">
          <img
              v-if="record.coverUri"
              :src="record.coverUri"
              class="cover-img"
              alt=""
          >
          <ion-icon
              v-else
              :icon="musicalNotesOutline"
          />

          <span class="cover-play">
            <ion-icon
                :icon="
                isCurrentTrack(record.track) && player.isPlaying
                  ? pauseOutline
                  : playOutline
              "
            />
          </span>
        </div>
      </button>

      <div class="track-info">
        <strong>{{ record.track.title }}</strong>

        <span>
          {{
            record.track.meta?.artists
                ?.map(artist => artist.name)
                .join(', ')
            || 'Неизвестный исполнитель'
          }}
        </span>

        <small>
          {{ formatSize(record.sizeBytes) }}
        </small>
      </div>

      <TrackContextMenu
          :track="record.track"
          @action="() => undefined"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {IonIcon} from '@ionic/vue';
import {
  musicalNotesOutline,
  pauseOutline,
  playOutline,
} from 'ionicons/icons';

import '@/components/track-menu/track-list.css';

import TrackContextMenu from '@/components/track-menu/TrackContextMenu.vue';
import usePlayerStore from '@/stores/player';
import {useDownloadsStore} from '@/stores/downloads';
import type {Track} from '@/types/TrackType';
import {PlaySourceListsEnum} from '@/types/PlaySourceListsEnum';

/**
 * Скачанные для офлайна треки. Источник — Dexie, список
 * работает без сети; воспроизведение идёт с локального файла.
 */
const player = usePlayerStore();
const downloads = useDownloadsStore();

const items = computed(() => downloads.records);

function isCurrentTrack(track: Track): boolean {
    return (
        player.currentTrack !== null
        && String(player.currentTrack.id) === String(track.id)
    );
}

async function playTrack(track: Track): Promise<void> {
    await player.playTrack(track, PlaySourceListsEnum.SINGLE);
}

function formatSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';

    const mb = bytes / (1024 * 1024);

    return `${mb.toFixed(1)} МБ`;
}
</script>

<style scoped>
.downloads-empty {
    padding: 40px 0;

    color: #9296a7;
    text-align: center;
}

.downloads-empty p {
    margin: 0 0 10px;
}

.downloads-hint {
    font-size: 12px;
    line-height: 1.6;
}

.cover-downloaded {
    background: linear-gradient(145deg, #2f6d4f, #173325);
}

.cover-img {
    width: 100%;
    height: 100%;

    object-fit: cover;
}
</style>
