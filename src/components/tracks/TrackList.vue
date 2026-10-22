
<template>
  <div class="track-list">
    <div
        v-for="track in tracks"
        :key="track.id"
        class="track-row"
        :class="{
        'track-row-active': isCurrentTrack(track),
        'track-row-menu-open': openMenuTrackId === String(track.id),
      }"
        @click="play(track)"
    >
      <button
          type="button"
          class="uploaded-track-play"
          :aria-label="`Воспроизвести ${track.title}`"
          @click.stop="play(track)"
      >
        <div
            class="cover"
            :style="{ '--cover-color': getTrackColor(track.id) }"
        >
          <ion-icon :icon="musicalNotesOutline" />

          <span class="cover-play">
            <ion-icon
                :icon="
                isCurrentTrack(track) && isPlaying
                  ? pauseOutline
                  : playOutline
              "
            />
          </span>
        </div>
      </button>

      <div class="track-info">
        <strong>{{ track.title }}</strong>

        <span>
          {{
            track.artists?.map(artist => artist.name).join(', ')
            || 'Неизвестный исполнитель'
          }}
        </span>

        <small>{{ track.album?.title || 'Без альбома' }}</small>
      </div>

      <span
          v-if="isCurrentTrack(track)"
          class="playing-indicator"
          aria-label="Сейчас воспроизводится"
      >
        <span />
        <span />
        <span />
      </span>

      <TrackContextMenu
          :track="track"
          :is-favorite="isFavorite(track)"
          :loading="loadingTrackId === Number(track.id)"
          @open="handleMenuOpen"
          @close="handleMenuClose"
          @action="(item, action) => emit('action', item, action)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IonIcon } from '@ionic/vue';
import { musicalNotesOutline, pauseOutline, playOutline } from 'ionicons/icons';

import type { Track } from '@/api/tracks';
import TrackContextMenu from './TrackContextMenu.vue';
import './track-list.css';

defineProps<{
  tracks: Track[];
  isCurrentTrack: (track: Track) => boolean;
  isPlaying: boolean;
  getTrackColor: (id: number | string) => string;
  isFavorite: (track: Track) => boolean;
  loadingTrackId: number | null;
}>();

const emit = defineEmits<{
  play: [track: Track];
  action: [track: Track, action: 'next' | 'queue' | 'favorite'];
  menuOpen: [track: Track];
}>();

const openMenuTrackId = ref<string | null>(null);

function play(track: Track) {
  emit('play', track);
}

function handleMenuClose(track: Track) {
  if (openMenuTrackId.value === String(track.id)) {
    openMenuTrackId.value = null;
  }
}

function handleMenuOpen(track: Track) {
  openMenuTrackId.value = String(track.id);
  emit('menuOpen', track);
}
</script>
