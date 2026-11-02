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
                v-if="track.meta.album?.cover_path"
                :src="track.meta.album.cover_path"
                :alt="track.meta.album.title || track.title"
                class="track-cover"
            />

            <div v-else class="track-cover-placeholder">
              <ion-icon :icon="musicalNotesOutline" />
            </div>

            <span class="cover-play">
              <ion-icon
                  :icon="isTrackPlaying(track) ? pauseOutline : playOutline"
              />
            </span>
          </div>
        </button>

        <div class="track-info">
          <strong>{{ track.title }}</strong>

          <span>
            {{
              track.meta.artists
                  ?.map(artist => artist.name)
                  .join(', ')
              || 'Неизвестный исполнитель'
            }}
          </span>

          <small>
            {{ track.meta?.album?.title || 'Без альбома' }}
          </small>

          <div class="track-source-row">
  <span
      class="source-badge"
      :class="getSourceTypeClass(track.source_type)"
  >
    {{ getSourceTypeLabel(track.source_type) }}
  </span>
              <ion-icon
                  v-if="
                    track.source_type !== 'upload'
                    && track.file?.path
                  "
                :icon="flashOutline"
                class="cached-audio-icon"
                aria-label="Ссылка на аудио сохранена"
                title="Ссылка на аудио сохранена"
            />
          </div>
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

        <!-- Избранное: состояние приходит снаружи (поиск). -->
        <button
            type="button"
            class="track-favorite-button"
            :class="{ liked: isTrackFavorite(track) }"
            :disabled="isTrackFavoriteLoading(track)"
            :aria-pressed="isTrackFavorite(track)"
            :aria-label="
              isTrackFavorite(track)
                ? 'Удалить из избранного'
                : 'Добавить в избранное'
            "
            @click.stop="emit('favorite', track)"
        >
          <ion-icon
              :icon="isTrackFavorite(track) ? heart : heartOutline"
          />
        </button>

        <TrackContextMenu
            :track="track"
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
  flashOutline,
  heart,
  heartOutline,
} from 'ionicons/icons';

import BaseInfiniteList from '@/components/lists/BaseInfiniteList.vue';
import TrackContextMenu from '@/components/track-menu/TrackContextMenu.vue';
import usePlayerStore from '@/stores/player';

import type {Track} from '@/types/TrackType';
import {PlaySourceListsEnum} from '@/types/PlaySourceListsEnum';

const player = usePlayerStore();

const loadingTrackId = ref<number | null>(null);
const openMenuTrackId = ref<string | null>(null);

const emit = defineEmits<{
  play: [track: Track];
  action: [
    track: Track,
    action: 'next' | 'queue' | 'favorite',
  ];
  favorite: [track: Track];
  menuOpen: [track: Track];
}>();

async function handleAction(
    track: Track,
    action: 'next' | 'queue' | 'favorite',
) {

  switch (action) {
    case 'queue':
      await player.addToQueue(track);
      break;

    case 'next':
      await player.playTrackNext(track);
      break;
  }
}

const sourceList = PlaySourceListsEnum.SEARCH;
function isTrackPlaying(track: Track): boolean {
  return isCurrentTrack(track) && player.isPlaying;
}
function isCurrentTrack(track: Track): boolean {
  const current = player.currentTrack;

  if (!current || !track) {
    return false;
  }

  // Совпадение по внутреннему ID (треки SkyFi).
  if (String(current.id) === String(track.id)) {
    return true;
  }

  // Совпадение по ID во внешнем каталоге (Яндекс, Internet Archive):
  // у текущего трека внутренний ID другой, сравниваем source_id.
  return (
      current.source_id != null &&
      String(current.source_id) === String(track.id)
  );
}

async function playTrack(track: Track): Promise<void> {
  if (!track?.id || player.isLoading) return;

  // Повторный клик по текущему треку — пауза/продолжение,
  // а не перезапуск с начала.
  if (isCurrentTrack(track)) {
    await player.togglePlay(sourceList);
    return;
  }

  player.setQueue([...props.items]);

  console.log('[Uploaded] Очередь перед запуском:', {
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
  upload: 'Моя музыка',
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
  /** Состояние избранного трека (сердечко слева от меню). */
  isFavoriteTrack?: (track: Track) => boolean;
  /** Идёт ли сейчас переключение избранного для трека. */
  isFavoriteLoadingTrack?: (track: Track) => boolean;
}>();

function isTrackFavorite(track: Track): boolean {
  return props.isFavoriteTrack
    ? props.isFavoriteTrack(track)
    : false;
}

function isTrackFavoriteLoading(track: Track): boolean {
  return props.isFavoriteLoadingTrack
    ? props.isFavoriteLoadingTrack(track)
    : false;
}

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
.track-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.track-title-row strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cached-audio-icon {
  flex-shrink: 0;
  font-size: 15px;
  color: #4ade80;
  filter: drop-shadow(0 0 3px rgb(74 222 128 / 25%));
}

.track-favorite-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #9296a7;
  cursor: pointer;
  transition: color 0.2s, transform 0.2s;
}

.track-favorite-button:hover:not(:disabled),
.track-favorite-button:focus-visible {
  color: #f5f7fa;
  transform: scale(1.08);
}

.track-favorite-button.liked {
  color: #c4b5fd;
}

.track-favorite-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.track-favorite-button ion-icon {
  font-size: 19px;
}
</style>
