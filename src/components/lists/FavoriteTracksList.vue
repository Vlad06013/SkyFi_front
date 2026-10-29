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
            <img
                v-if="track.meta?.album?.cover_path"
                :src="track.meta?.album?.cover_path"
                :alt="track.meta?.album?.title || track.title"
                class="track-cover"
            />

            <div v-else class="track-cover-placeholder">
              <ion-icon :icon="musicalNotesOutline" />
            </div>

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
              track.meta?.artists
                  ?.map(artist => artist.name)
                  .join(', ')
              || 'Неизвестный исполнитель'
            }}
          </span>

          <small>
            {{ track.meta?.album?.title || 'Без альбома' }}
          </small>
          <span
              class="source-badge"
              :class="getSourceTypeClass(track.source_type)"
          >
            {{ getSourceTypeLabel(track.source_type) }}
          </span>
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
const sourceList = "favorites";

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

  await player.playTrack(track, sourceList);
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

const sourceTypeLabels: Record<string, string> = {
  yandex_music: 'Yandex Music',
  upload: 'Загруженное',
};

function getSourceTypeLabel(sourceType: string): string {
  return sourceTypeLabels[sourceType] ?? 'Другой источник';
}

function getSourceTypeClass(sourceType: string): string {
  switch (sourceType) {
    case 'yandex_music':
      return 'source-badge--yandex';

    case 'uploads':
      return 'source-badge--uploads';

    default:
      return 'source-badge--other';
  }
}
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
<style scoped>
.source-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin-top: 5px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.02em;
}

.source-badge--yandex {
  color: #d8c8ff;
  background: rgb(139 92 246 / 16%);
  border: 1px solid rgb(139 92 246 / 25%);
}

.source-badge--uploads {
  color: #8ce9d4;
  background: rgb(45 212 191 / 12%);
  border: 1px solid rgb(45 212 191 / 22%);
}

.source-badge--other {
  color: var(--ion-color-medium);
  background: rgb(128 128 128 / 10%);
  border: 1px solid rgb(128 128 128 / 20%);
}
</style>