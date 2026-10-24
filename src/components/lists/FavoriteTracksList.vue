<template>
  <BaseInfiniteList
      :items="items"
      :loading="loading"
      :loading-more="false"
      :has-more="false"
      :error="error"
      :get-key="track => track.id"
      :load-more="async () => {}"
      :retry="async () => {
        await props.retry();
      }"
  >
    <template #item="{ item: track }">
      <div
          class="track-row"
          :class="{
          'track-row-active': isCurrentTrack(track),
          'track-row-menu-open':
            openMenuTrackId === String(track.id),
        }"
          @click="playTrack(track)"
      >
        <button
            type="button"
            class="uploaded-track-play"
            :aria-label="`Воспроизвести ${track.title}`"
            @click.stop="playTrack(track)"
        >
          <div
              class="cover"
              :style="{
              '--cover-color': getTrackColor(track.id),
            }"
          >
            <ion-icon :icon="musicalNotesOutline"/>

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
              track.artists
                  ?.map(artist => artist.name)
                  .join(', ')
              || 'Неизвестный исполнитель'
            }}
          </span>

          <small>
            {{ track.album?.title || 'Без альбома' }}
          </small>
        </div>

        <span
            v-if="isCurrentTrack(track)"
            class="playing-indicator"
            aria-label="Сейчас воспроизводится"
        >
          <span/>
          <span/>
          <span/>
        </span>

        <TrackContextMenu
            :track="track"
            :is-favorite="true"
            :loading="loadingTrackId === Number(track.id)"
            @open="handleMenuOpen"
            @close="handleMenuClose"
            @action="handleAction"
        />
      </div>
    </template>
  </BaseInfiniteList>
</template>

<script setup lang="ts">
import {computed, watch, ref} from 'vue';
import {IonIcon} from '@ionic/vue';
import {
  musicalNotesOutline,
  pauseOutline,
  playOutline,
} from 'ionicons/icons';

import BaseInfiniteList from '@/components/lists/BaseInfiniteList.vue';
import TrackContextMenu from '@/components/track-menu/TrackContextMenu.vue';
import usePlayerStore from '@/stores/player';

// import { getFavorites } from '@/api/favorites';
import type {Track} from '@/types/TrackType';

const player = usePlayerStore();

const loadingTrackId = ref<number | null>(null);
const openMenuTrackId = ref<string | null>(null);

const emit = defineEmits<{
  play: [track: Track];
  action: [
    track: Track,
    action: 'next' | 'queue' | 'favorite',
  ];
  menuOpen: [track: Track];
}>();

async function handleAction(
    track: Track,
    action: 'next' | 'queue' | 'favorite',
    isFavorite: boolean,

) {
  console.log('Из списка',action);

  switch (action) {
    case 'queue':
      await player.addToQueue(track);
      break;

    case 'next':
      await player.playTrackNext(track);
      break;

    case 'favorite':
      await player.toggleFavorite(track, isFavorite);
// Обновляем список избранного после успешного действия.
      await props.retry();
      break;
  }
}

const isPlaying = computed(() => player.isPlaying);

function isCurrentTrack(track: Track): boolean {
  return Number(player.currentTrack?.id) === Number(track.id);
}

async function playTrack(track: Track): Promise<void> {
  if (!track?.id || player.isLoading) return;

  player.setQueue([...props.items]);

  console.log('[Favorites] Очередь перед запуском:', {
    count: props.items.length,
    ids: props.items.map(item => item.id),
    selectedTrackId: track.id,
  });

  await player.playTrack(track);
}


function handleMenuOpen(track: Track): void {
  openMenuTrackId.value = String(track.id);
  emit('menuOpen', track);
}

function handleMenuClose(track: Track): void {
  if (openMenuTrackId.value === String(track.id)) {
    openMenuTrackId.value = null;
  }
}

// Оформление обложек.
const coverColors = [
  '#6546B8',
  '#277D8A',
  '#A04C72',
  '#B26A38',
  '#3569A8',
  '#47865C',
  '#8157A6',
  '#B64E61',
  '#4B65B5',
  '#337E75',
];

function getTrackColor(id: number | string): string {
  const normalizedId = Number(id);

  if (!Number.isFinite(normalizedId)) {
    return coverColors[0];
  }

  return coverColors[
  Math.abs(normalizedId) % coverColors.length
      ];
}

const props = defineProps<{
  items: Track[];
  loading: boolean;
  error: string | null;
  retry: () => void | Promise<void>;
}>();

watch(
    () => props.items,
    (tracks) => {
      if (
          !player.isServerSyncEnabled ||
          tracks.length === 0
      ) {
        return;
      }

      player.setQueue([...tracks]);

      console.log('[Favorites] Очередь синхронизирована:', {
        count: tracks.length,
        ids: tracks.map(track => track.id),
      });
    },
    { immediate: true },
);
</script>
