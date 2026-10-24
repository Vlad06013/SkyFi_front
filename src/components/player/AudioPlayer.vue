<template>
  <footer
      class="player"
      :style="{ '--player-progress': `${player.progressPercent}%` }"
      @click="handlePlayerSurfaceClick"
  >
    <!-- Информация о текущем треке -->
    <div class="now-playing">
      <div
          v-if="player.currentTrack"
          class="mini-cover"
          :class="player.currentTrack.cover"
      >
        {{ player.currentTrack.symbol }}
      </div>

      <div v-else class="mini-cover mini-empty">
        ♫
      </div>

      <div class="now-info">
        <strong>
          {{ player.currentTrack?.title ?? 'Выбери свой трек' }}
        </strong>

        <span>
      {{
            player.currentTrack?.artist
            ?? 'SkyFi · музыкальное пространство'
          }}
    </span>
      </div>

      <!-- Кнопка очереди воспроизведения -->
      <button
          type="button"
          class="queue-toggle"
          :class="{ 'queue-toggle-active': showQueue }"
          :aria-pressed="showQueue"
          aria-label="Открыть очередь воспроизведения"
          title="Очередь воспроизведения"
          @click="showQueue = !showQueue"
      >
        <svg
            viewBox="0 0 24 24"
            width="21"
            height="21"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
        >
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h10" />
          <path d="m17 16 3 2-3 2" />
        </svg>

        <span
            v-if="player.queue.length > 0"
            class="queue-count"
        >
      {{ player.queue.length }}
    </span>
      </button>

      <!-- Избранное -->
      <button
          class="heart-button"
          :class="{ liked: player.liked }"
          :disabled="
      player.favoriteLoading ||
      !player.currentTrack ||
      typeof player.currentTrack.id !== 'number'
    "
          :aria-label="
      player.liked
        ? 'Убрать из избранного'
        : 'Добавить в избранное'
    "
          :aria-pressed="player.liked"
          type="button"
          @click="player.toggleFavorite()"
      >
        <svg
            viewBox="0 0 24 24"
            class="control-icon heart-icon"
            :class="{ 'is-liked': player.liked }"
            fill="currentColor"
            aria-hidden="true"
        >
          <path
              d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"
          />
        </svg>
      </button>
      <TrackContextMenu
          v-if="player.currentTrack"
          :track="player.currentTrack"
          :is-favorite="player.liked"
          :loading="player.isLoading || player.favoriteLoading"
          @action="handleTrackMenuAction"
      />
    </div>

    <!-- Центральное управление -->
    <div class="player-center">
      <div class="player-controls">
        <!-- Перемешивание -->
        <button
            type="button"
            class="mode-button shuffle-button"
            :class="{ 'mode-active': player.isShuffleEnabled }"
            :aria-pressed="player.isShuffleEnabled"
            :aria-label="
              player.isShuffleEnabled
                ? 'Выключить случайный порядок'
                : 'Включить случайный порядок'
            "
            :title="
              player.isShuffleEnabled
                ? 'Случайный порядок включён'
                : 'Случайный порядок выключен'
            "
            :disabled="player.isLoading"
            @click="player.toggleShuffle()"
        >
          <svg
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
          >
            <path d="M16 3h5v5" />
            <path d="M4 20L21 3" />
            <path d="M21 16v5h-5" />
            <path d="M15 15l6 6" />
            <path d="M4 4l5 5" />
          </svg>
          <span
              v-if="player.isShuffleEnabled"
              class="shuffle-indicator"
              aria-hidden="true"
          ></span>
        </button>

        <!-- Предыдущий трек -->
        <button
            type="button"
            aria-label="Предыдущий трек"
            :disabled="
            player.isLoading ||
            !player.currentTrack
          "
            @click="player.playPrevious()"
        >
          <svg viewBox="0 0 24 24" class="control-icon" aria-hidden="true">
            <path d="M6 5v14M19 5 8 12l11 7V5Z" />
          </svg>
        </button>

        <!-- Play / Pause -->
        <button
            class="play-button"
            type="button"
            :disabled="player.isLoading || !player.currentTrack"
            :aria-label="player.isPlaying ? 'Пауза' : 'Воспроизвести'"
            :title="player.isPlaying ? 'Пауза' : 'Воспроизвести'"
            @click.stop="player.togglePlay()"
        >
          <svg
              v-if="player.isLoading"
              class="control-icon loading-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
          </svg>

          <svg
              v-else-if="player.isPlaying"
              class="control-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
          >
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>

          <svg
              v-else
              class="control-icon play-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
          >
            <path d="M7 4.5L20 12 7 19.5Z" />
          </svg>
        </button>



        <!-- Следующий трек -->
        <button
            type="button"
            aria-label="Следующий трек"
            :disabled="
        player.isLoading ||
        !player.currentTrack
    "
            @click="player.playNext()"
        >
          <svg viewBox="0 0 24 24" class="control-icon" aria-hidden="true">
            <path d="M18 5v14M5 5l11 7-11 7V5Z" />
          </svg>
        </button>
        <!-- Режим повтора: выключен / всё / один трек -->
        <button
            type="button"
            class="mode-button repeat-button"
            :class="{ 'mode-active': player.repeatMode !== 'off' }"
            :aria-pressed="player.repeatMode !== 'off'"
            :aria-label="
        player.repeatMode === 'off'
            ? 'Включить повтор'
            : player.repeatMode === 'all'
              ? 'Повтор всего плейлиста'
              : 'Повтор одного трека'
    "
            :title="
        player.repeatMode === 'off'
            ? 'Повтор выключен'
            : player.repeatMode === 'all'
              ? 'Повтор всего плейлиста'
              : 'Повтор одного трека'
    "
            :disabled="player.isLoading"
            @click="player.toggleRepeatMode()"
        >
          <svg
              v-if="player.repeatMode !== 'one'"
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
          >
            <path d="m17 2 4 4-4 4" />
            <path d="M3 11V9a3 3 0 0 1 3-3h15" />
            <path d="m7 22-4-4 4-4" />
            <path d="M21 13v2a3 3 0 0 1-3 3H3" />
          </svg>

          <svg
              v-else
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
          >
            <path d="m17 2 4 4-4 4" />
            <path d="M3 11V9a3 3 0 0 1 3-3h15" />
            <path d="m7 22-4-4 4-4" />
            <path d="M21 13v2a3 3 0 0 1-3 3H3" />
            <text
                x="12"
                y="14"
                text-anchor="middle"
                font-size="9"
                font-weight="700"
                fill="currentColor"
                stroke="none"
            >1</text>
          </svg>

          <span
              v-if="player.repeatMode !== 'off'"
              class="shuffle-indicator"
              aria-hidden="true"
          ></span>
        </button>
      </div>

      <!-- Прогресс воспроизведения -->
      <div class="progress-row">
        <span>
          {{ player.formatTime(player.progress) }}
        </span>

        <input
            :value="Math.min(
                player.audioDuration,
                Math.max(0, player.progress)
              )"
            class="progress"
            type="range"
            min="0"
            :max="Math.max(1, player.audioDuration)"
            step="0.1"
            :style="{
                '--range-progress': `${player.progressPercent}%`,
              }"
                        aria-label="Позиция воспроизведения"
                        :disabled="
                !player.currentTrack ||
                player.audioDuration <= 0 ||
                player.isLoading
              "
            @pointerdown="player.isSeeking = true"
            @input="player.progress = Number(($event.target as HTMLInputElement).value)"
            @change="player.seekAudio(player.progress); player.isSeeking = false"
        />

        <span>
          {{ player.formatTime(player.audioDuration) }}
        </span>
      </div>
    </div>


    <!-- Громкость -->
    <div class="player-right">
      <div class="device-selector">
        <button
            type="button"
            class="device-button mode-button"
            :class="{ 'mode-active': showDeviceMenu }"
            :aria-pressed="showDeviceMenu"
            :disabled="
              player.isDevicesLoading ||
              player.deviceSwitchLoading
            "
            aria-label="Выбрать устройство воспроизведения"
            title="Устройство воспроизведения"
            @click="showDeviceMenu = !showDeviceMenu"
        >
          <svg
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
          >
            <rect x="3" y="5" width="13" height="11" rx="2" />
            <path d="M7 20h5" />
            <path d="M9.5 16v4" />
            <rect x="17" y="8" width="4" height="11" rx="1.2" />
            <path d="M18.5 16.5h1" />
          </svg>
        </button>

        <div
            v-if="showDeviceMenu"
            class="device-menu"
        >
          <strong>Устройство воспроизведения</strong>

          <p v-if="player.isDevicesLoading">
            Загрузка устройств…
          </p>

          <p
              v-else-if="player.devices.length === 0"
              class="device-empty"
          >
            Нет зарегистрированных устройств
          </p>

          <button
              v-for="device in player.devices"
              :key="device.id"
              type="button"
              class="device-option"
              :class="{
                'device-option-active':
                  device.id === player.activeDeviceId,
              }"
              :disabled="player.deviceSwitchLoading"
              @click="selectDevice(device.id)"
          >
            <span>
              {{ device.type === 'phone' ? '▯' : '▣' }}
            </span>

            <span class="device-option-name">
              {{ device.name }}
            </span>

            <span v-if="device.id === player.activeDeviceId">
              ✓
            </span>
          </button>
        </div>
      </div>

      <!-- Вертикальная громкость -->
      <div class="volume-control">
        <button
            type="button"
            class="volume-button"
            aria-label="Настроить громкость"
            aria-haspopup="true"
            title="Громкость"
        >
          <svg
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
          >
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            <path
                v-if="player.volume > 0"
                d="M15.5 8.5a5 5 0 0 1 0 7"
            />
            <path
                v-if="player.volume > 0"
                d="M18.5 5.5a9 9 0 0 1 0 13"
            />
            <path
                v-if="player.volume === 0"
                d="m16 9 5 6m0-6-5 6"
            />
          </svg>
        </button>

        <div class="volume-slider-popover">
          <span class="volume-value">
            {{ player.volume }}%
          </span>

          <input
              v-model.number="player.volume"
              class="volume-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              aria-label="Громкость"
              :style="{
                '--range-progress': `${player.volume}%`,
              }"
          />
        </div>
      </div>

    </div>
  </footer>
  <Teleport to="body">
    <div
        v-if="showTrackDetails && player.currentTrack"
        class="track-details-backdrop"
        @click.self="showTrackDetails = false"
    >
      <section
          class="track-details-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Плеер и информация о треке"
      >
        <header class="track-details-header">
          <button
              type="button"
              class="track-details-close"
              aria-label="Закрыть плеер"
              @click="showTrackDetails = false"
          >
            ✕
          </button>

          <span>СЕЙЧАС ИГРАЕТ</span>

          <button
              type="button"
              class="track-details-queue"
              aria-label="Открыть очередь"
              @click="showQueue = true; showTrackDetails = false"
          >
            ☷
          </button>
        </header>

        <div
            class="track-details-cover"
            :class="player.currentTrack.cover"
        >
          {{ player.currentTrack.symbol || '♫' }}
        </div>

        <div class="track-details-info">
          <div class="track-details-text">
            <h2>{{ player.currentTrack.title }}</h2>
            <p>
              {{ player.currentTrack.artist || 'Неизвестный исполнитель' }}
            </p>
          </div>

          <button
              type="button"
              class="track-details-heart"
              :class="{ liked: player.liked }"
              :disabled="player.favoriteLoading"
              :aria-label="
            player.liked
              ? 'Убрать из избранного'
              : 'Добавить в избранное'
          "
              @click="player.toggleFavorite()"
          >
            {{ player.liked ? '♥' : '♡' }}
          </button>
        </div>

        <div class="track-details-progress">
          <input
              class="track-details-range"
              type="range"
              min="0"
              :max="Math.max(1, player.audioDuration)"
              step="0.1"
              :value="Math.min(
            player.audioDuration,
            Math.max(0, player.progress)
          )"
              :style="{
            '--range-progress': `${player.progressPercent}%`
          }"
              aria-label="Перемотка трека"
              :disabled="
            !player.currentTrack ||
            player.audioDuration <= 0 ||
            player.isLoading
          "
              @pointerdown="player.isSeeking = true"
              @input="
            player.progress = Number(
              ($event.target as HTMLInputElement).value
            )
          "
              @change="
            player.seekAudio(player.progress);
            player.isSeeking = false
          "
          />

          <div class="track-details-times">
            <span>{{ player.formatTime(player.progress) }}</span>
            <span>{{ player.formatTime(player.audioDuration) }}</span>
          </div>
        </div>

        <div class="track-details-controls">
          <button
              type="button"
              aria-label="Предыдущий трек"
              :disabled="player.isLoading || !player.currentTrack"
              @click="player.playPrevious()"
          >
            |◀
          </button>

          <button
              type="button"
              class="track-details-play"
              :disabled="player.isLoading || !player.currentTrack"
              :aria-label="player.isPlaying ? 'Пауза' : 'Воспроизвести'"
              @click="player.togglePlay()"
          >
            {{
              player.isLoading
                  ? '…'
                  : player.isPlaying
                      ? 'Ⅱ'
                      : '▶'
            }}
          </button>

          <button
              type="button"
              aria-label="Следующий трек"
              :disabled="player.isLoading || !player.currentTrack"
              @click="player.playNext()"
          >
            ▶|
          </button>
        </div>

        <p class="track-details-hint">
          Перемещай ползунок, чтобы перейти к нужному моменту
        </p>
      </section>
    </div>
  </Teleport>
  <QueuePanel
      :open="showQueue"
      :current-track="player.currentTrack"
      @close="showQueue = false"
  />
</template>

<script setup lang="ts">
import './audioPlayer.css';

import { computed, onMounted, ref, watch } from 'vue';
import usePlayerStore from '@/stores/player';
import QueuePanel from '@/components/player/queue/QueuePanel.vue';
import TrackContextMenu from '@/components/track-menu/TrackContextMenu.vue';

const player = usePlayerStore();

const showQueue = ref(false);
const showDeviceMenu = ref(false);
const showTrackDetails = ref(false);

const currentTrackNumericId = computed<number | null>(() => {
  const id = player.currentTrack?.id;

  return id != null && Number.isFinite(Number(id))
      ? Number(id)
      : null;
});

async function selectDevice(deviceId: number): Promise<void> {
  await player.switchDevice(deviceId);

  showDeviceMenu.value = false;
}

onMounted(async () => {
  await player.initializePlayerDevice();

  if (player.isServerSyncEnabled) {
    player.subscribeToDeviceChanges();
  }
});

watch(
    () => Boolean(player.isServerSyncEnabled),
    async (isAuthenticated) => {
      if (isAuthenticated) {
        await player.initializePlayerDevice();
        player.subscribeToDeviceChanges();
      }
    },
);

function onProgressInput(event: Event): void {
  const target = event.target as HTMLInputElement;

  player.progress = Number(target.value);
  player.isSeeking = true;
}

function onProgressChange(event: Event): void {
  const target = event.target as HTMLInputElement;

  player.progress = Number(target.value);
  player.seekAudio(player.progress);
  player.isSeeking = false;
}
import type { TrackType } from '@/types/TrackType';
function handleTrackMenuAction(
    track: TrackType,
    action: 'next' | 'queue' | 'favorite',
) {
  switch (action) {
    case 'next':
      // Вызови существующий метод добавления трека следующим.
      break;

    case 'queue':
      // Вызови существующий метод добавления трека в очередь.
      break;

    case 'favorite':
      // Вызови существующий метод переключения избранного.
      break;
  }
}

function handlePlayerSurfaceClick(event: MouseEvent) {
  const target = event.target;

  if (!(target instanceof Element)) return;

  // Не открываем модалку при нажатии на элементы управления
  if (
      target.closest(
          'button, input, a, .track-menu-wrap, .track-context-menu, .track-context-sheet, .device-menu, .volume-control'
      )
  ) {
    return;
  }

  if (player.currentTrack) {
    showTrackDetails.value = true;
  }
}
</script>
