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
          role="button"
          tabindex="0"
          :aria-label="`Воспроизвести: ${track.title}`"
          :class="{
          'track-row-active': isCurrentTrack(track),
          'track-row-menu-open':
            openMenuTrackId === String(track.id),
        }"
          @click="onRowClick(track)"
          @keydown="onRowKeyDown($event, track)"
      >
        <button
            type="button"
            tabindex="-1"
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
              track.meta.artists
                  .map(artist => artist.name)
                  .join(', ')
              || 'Неизвестный исполнитель'
            }}
          </span>

          <small>
            {{ track.meta.album?.title || 'Без альбома' }}
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
            :is-favorite="isTrackFavorite(track)"
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
import '@/components/track-menu/track-list.css';

import {computed, watch, ref, onMounted} from 'vue';
import {IonIcon} from '@ionic/vue';
import {
  musicalNotesOutline,
  pauseOutline,
  playOutline,
} from 'ionicons/icons';

import BaseInfiniteList from '@/components/lists/BaseInfiniteList.vue';
import TrackContextMenu from '@/components/track-menu/TrackContextMenu.vue';
import usePlayerStore from '@/stores/player';

import {getFavorites} from '@/api/favorites';
import type {Track} from '@/types/TrackType';
import {PlaySourceListsEnum} from '@/types/PlaySourceListsEnum';

const player = usePlayerStore();

const loadingTrackId = ref<number | null>(null);
const openMenuTrackId = ref<string | null>(null);
const sourceList = PlaySourceListsEnum.UPLOAD;

/** Ключи избранного: у загрузок source_id нет — ключом служит id. */
const favoriteTrackKeys = ref<Set<string>>(new Set());

function isTrackFavorite(track: Track): boolean {
  return favoriteTrackKeys.value.has(
      String(track.source_id ?? track.id),
  );
}

async function loadFavoriteKeys(): Promise<void> {
  try {
    const favorites = await getFavorites();

    favoriteTrackKeys.value = new Set(
        favorites.map((track) =>
            String(track.source_id ?? track.id),
        ),
    );
  } catch (error) {
    console.warn(
        '[Uploaded] Не удалось загрузить избранное:',
        error,
    );
  }
}

onMounted(() => {
  void loadFavoriteKeys();
});

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

  switch (action) {
    case 'queue':
      await player.addToQueue(track);
      break;

    case 'next':
      await player.playTrackNext(track);
      break;

    case 'favorite': {
      await player.toggleFavorite(track, isFavorite);

      const key = String(track.source_id ?? track.id);
      const keys = new Set(favoriteTrackKeys.value);

      if (isFavorite) {
        keys.delete(key);
      } else {
        keys.add(key);
      }

      favoriteTrackKeys.value = keys;
      break;
    }
  }
}

const isPlaying = computed(() => player.isPlaying);

function isCurrentTrack(track: Track): boolean {
  return Number(player.currentTrack?.id) === Number(track.id);
}

async function playTrack(track: Track): Promise<void> {
  if (!track?.id || player.isLoading) return;

  // Повторный клик по текущему треку — пауза/продолжение,
  // а не перезапуск с начала.
  if (isCurrentTrack(track)) {
    await player.togglePlay(sourceList);
    return;
  }

  player.setQueue([...props.items], sourceList);

  console.log('[Uploaded] Очередь перед запуском:', {
    count: props.items.length,
    ids: props.items.map(item => item.id),
    selectedTrackId: track.id,
  });

  await player.playTrack(track, sourceList);
}

// ============================================
// НАВИГАЦИЯ ПУЛЬТОМ ТВ: СТРОКА — ЕДИНАЯ ФОКУСНАЯ ЗОНА
// ============================================

/*
 * Центральная клавиша пульта на части устройств шлёт и keydown,
 * и синтезированный click — без защиты трек стартовал бы дважды
 * (второй «клик» тут же ставил бы его на паузу).
 */
let rowKeyActivatedAt = 0;
const ROW_KEY_CLICK_GUARD_MS = 400;

function onRowClick(track: Track): void {
  if (Date.now() - rowKeyActivatedAt < ROW_KEY_CLICK_GUARD_MS) {
    return;
  }

  void playTrack(track);
}

function focusRow(row: HTMLElement | null): void {
  if (!(row instanceof HTMLElement)) return;

  row.focus();
  row.scrollIntoView({ block: 'nearest' });
}

function onRowKeyDown(event: KeyboardEvent, track: Track): void {
  const row = event.currentTarget;

  if (!(row instanceof HTMLElement)) return;

  switch (event.key) {
    case 'Enter':
    case ' ':
      event.preventDefault();
      rowKeyActivatedAt = Date.now();
      void playTrack(track);
      return;

    case 'ArrowDown':
    case 'ArrowUp': {
      event.preventDefault();

      const sibling = (
          event.key === 'ArrowDown'
              ? row.nextElementSibling
              : row.previousElementSibling
      ) as HTMLElement | null;

      if (
          sibling instanceof HTMLElement
          && sibling.classList.contains('track-row')
      ) {
        focusRow(sibling);
      }
      return;
    }

    case 'ArrowRight':
      // Меню трека остаётся достижимым: вправо — на «три точки».
      event.preventDefault();
      row.querySelector<HTMLElement>('.track-menu-trigger')?.focus();
      return;
  }
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

      player.setQueue([...tracks], sourceList);

      console.log('[Favorites] Очередь синхронизирована:', {
        count: tracks.length,
        ids: tracks.map(track => track.id),
      });
    },
    { immediate: true },
);
</script>
