<template>
  <footer class="player">
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
        {{ player.liked ? '♥' : '♡' }}
      </button>

      <!-- Меню действий с треком (планшет и телефон) -->
      <div class="track-menu-wrap track-menu-compact" @click.stop @pointerdown.stop>
        <button
            type="button"
            class="track-menu-button"
            :disabled="!player.currentTrack"
            :aria-expanded="showTrackMenu"
            aria-haspopup="true"
            aria-label="Действия с треком"
            title="Действия с треком"
            @click.stop="showTrackMenu = !showTrackMenu"
        >
          <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="currentColor"
              aria-hidden="true"
          >
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>

        <div v-if="showTrackMenu" class="track-menu-panel" role="menu">
          <AddToPlaylistItem
              :track-id="currentTrackNumericId"
              @close="showTrackMenu = false"
          />
          <DownloadTrackItem @close="showTrackMenu = false" />
        </div>
      </div>
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
          |◀
        </button>

        <!-- Play / Pause -->
        <button
            class="play-button"
            type="button"
            :disabled="player.isLoading || !player.currentTrack"
            :aria-label="player.isPlaying ? 'Пауза' : 'Воспроизвести'"
            :title="player.isPlaying ? 'Пауза' : 'Воспроизвести'"
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
          ▶|
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
      <span aria-hidden="true">♫</span>

      <input
          v-model.number="player.volume"
          type="range"
          min="0"
          max="100"
          step="1"
          aria-label="Громкость"
          :style="{
          '--range-progress': `${player.volume}%`,
        }"
      />

      <!-- Меню действий с треком -->
      <div class="track-menu-wrap" @click.stop @pointerdown.stop>
        <button
            type="button"
            class="track-menu-button"
            :disabled="!player.currentTrack"
            :aria-expanded="showTrackMenu"
            aria-haspopup="true"
            aria-label="Действия с треком"
            title="Действия с треком"
            @click.stop="showTrackMenu = !showTrackMenu"
        >
          <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="currentColor"
              aria-hidden="true"
          >
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>

        <div v-if="showTrackMenu" class="track-menu-panel" role="menu">
          <AddToPlaylistItem
              :track-id="currentTrackNumericId"
              @close="showTrackMenu = false"
          />
          <DownloadTrackItem @close="showTrackMenu = false" />
        </div>
      </div>
    </div>
  </footer>
  <QueuePanel
      :open="showQueue"
      :current-track="player.currentTrack"
      @close="showQueue = false"
  />
</template>

<script setup lang="ts">
import usePlayerStore from '@/stores/player';
import QueuePanel from '@/components/player/QueuePanel.vue';
const showQueue = ref(false);
const player = usePlayerStore();

import { ref, onMounted, watch } from 'vue';


const showDeviceMenu = ref(false);

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
</script>

<style scoped>
/* ========================================
   НИЖНИЙ АУДИОПЛЕЕР
======================================== */

.player {
  position: fixed;

  /*
   * Боковая навигация занимает 236px.
   * Плеер начинается справа от неё.
   */
  left: 236px;
  right: 0;
  bottom: 0;

  z-index: 900;

  min-height: 91px;
  box-sizing: border-box;

  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    minmax(0, 1.1fr)
    minmax(0, 1fr);

  align-items: center;
  gap: 20px;

  padding: 13px 27px;

  border-top: 1px solid #ffffff12;

  background: rgba(17, 18, 27, 0.97);
  backdrop-filter: blur(20px);
}

/* ========================================
   ТЕКУЩИЙ ТРЕК
======================================== */

.now-playing {
  display: flex;
  align-items: center;
  gap: 11px;

  min-width: 0;
}

.mini-cover {
  display: grid;
  place-items: center;

  flex-shrink: 0;

  width: 49px;
  height: 49px;

  border-radius: 8px;

  color: white;
  font-size: 22px;

  background: linear-gradient(
      135deg,
      #7658bc,
      #32244e
  );
}

.mini-empty {
  background: #272238;
}

.now-info {
  flex: 1;
  min-width: 0;
}

.now-info strong,
.now-info span {
  display: block;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.now-info strong {
  color: #f5f3fa;
  font-size: 11px;
}

.now-info span {
  margin-top: 6px;

  color: #85899c;
  font-size: 10px;
}

/* ========================================
   ИЗБРАННОЕ
======================================== */

.heart-button {
  flex-shrink: 0;

  border: 0;
  padding: 4px;

  background: transparent;

  color: #9295a8;

  cursor: pointer;
  font-size: 22px;

  transition:
      color 0.2s,
      transform 0.2s;
}

.heart-button:hover:not(:disabled) {
  color: #d5c5ff;
  transform: scale(1.1);
}

.heart-button.liked {
  color: #e88bae;
}

.heart-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ========================================
   ЦЕНТРАЛЬНОЕ УПРАВЛЕНИЕ
======================================== */

.player-center {
  min-width: 0;
}

.player-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 21px;

  margin-bottom: 9px;
}

.player-controls button {
  display: grid;
  place-items: center;

  min-width: 24px;
  min-height: 28px;

  border: 0;
  padding: 0;

  background: transparent;

  color: #9295a8;

  cursor: pointer;
  font-size: 13px;

  transition:
      color 0.2s,
      transform 0.2s,
      opacity 0.2s;
}

.player-controls button:hover:not(:disabled) {
  color: #d0c2ff;
  transform: scale(1.08);
}

.player-controls button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.player-controls .mode-button {
  position: relative;
  display: grid;
  place-items: center;
  min-width: 32px;
  min-height: 32px;
  border-radius: 9px;
  color: #9295a8;
  background: transparent;
  transition:
      color 0.2s ease,
      background 0.2s ease,
      box-shadow 0.2s ease;
}

.player-controls .mode-button.mode-active {
  color: #c4b5fd;
  background: rgba(167, 139, 250, 0.16);
  box-shadow: inset 0 0 0 1px rgba(167, 139, 250, 0.3);
}

.shuffle-indicator {
  position: absolute;
  width: 5px;
  height: 5px;
  right: 3px;
  top: 3px;
  border-radius: 50%;
  background: #c4b5fd;
  box-shadow: 0 0 6px rgba(196, 181, 253, 0.8);
}

.repeat-one-badge {
  position: absolute;
  right: -2px;
  bottom: -1px;
  font-size: 8px;
  font-weight: 700;
  color: #b8a2ff;
}

/* Кнопка воспроизведения */

.player-controls .play-button {
  width: 34px;
  height: 34px;

  min-width: 34px;
  min-height: 34px;

  border-radius: 50%;

  background: #b8a2ff;
  color: #1b1428;

  font-size: 13px;

  transition:
      background 0.2s,
      transform 0.2s;
}

.player-controls .play-button:hover:not(:disabled) {
  background: #c9baff;
  color: #1b1428;

  transform: scale(1.06);
}

.player-controls .play-button:disabled {
  opacity: 0.5;
}

/* ========================================
   ПРОГРЕСС
======================================== */

.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;

  width: 100%;
  min-width: 0;
}

.progress-row > span {
  flex-shrink: 0;

  min-width: 35px;

  color: #9292a8;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.progress-row > span:last-child {
  text-align: right;
}

/* Общий стиль ползунков */

.progress,
.player-right input {
  --range-progress: 0%;

  appearance: none;
  -webkit-appearance: none;

  display: block;

  min-width: 0;
  width: 100%;
  height: 5px;

  margin: 0;
  padding: 0;

  border: none;
  border-radius: 999px;
  outline: none;

  background: linear-gradient(
      to right,
      #b39bff 0%,
      #b39bff var(--range-progress),
      #383744 var(--range-progress),
      #383744 100%
  );

  cursor: pointer;
}

.progress:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Chrome, Safari, Edge */

.progress::-webkit-slider-thumb,
.player-right input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;

  width: 12px;
  height: 12px;

  border: none;
  border-radius: 50%;

  background: #c4b2ff;
  box-shadow: 0 0 5px #0005;

  cursor: grab;
}

.progress:active::-webkit-slider-thumb,
.player-right input:active::-webkit-slider-thumb {
  cursor: grabbing;
  transform: scale(1.15);
}

/* Firefox */

.progress::-moz-range-thumb,
.player-right input::-moz-range-thumb {
  width: 12px;
  height: 12px;

  border: none;
  border-radius: 50%;

  background: #c4b2ff;
  box-shadow: 0 0 5px #0005;

  cursor: grab;
}

.progress:active::-moz-range-thumb,
.player-right input:active::-moz-range-thumb {
  cursor: grabbing;
}

/* Дорожка Firefox */

.progress::-moz-range-track,
.player-right input::-moz-range-track {
  height: 5px;

  border: none;
  border-radius: 999px;

  background: transparent;
}

/* Фокус клавиатуры */

.progress:focus-visible,
.player-right input:focus-visible,
.player-controls button:focus-visible,
.heart-button:focus-visible {
  outline: 2px solid #a78bfa80;
  outline-offset: 5px;
}

/* ========================================
   ГРОМКОСТЬ
======================================== */

.player-right {
  display: flex;
  align-items: center;
  justify-content: end;
  gap: 12px;

  min-width: 0;

  color: #9a9caf;
}

.player-right > span {
  flex-shrink: 0;
}

.player-right input {
  width: 110px;
  max-width: 100%;

  flex: 0 1 110px;
}

/* ========================================
   ПЛАНШЕТЫ
======================================== */

@media (max-width: 1050px) and (min-width: 701px) {
  .player {
    gap: 14px;
    padding-right: 18px;
    padding-left: 18px;

    grid-template-columns:
      minmax(0, 1fr)
      minmax(0, 1fr);
  }

  .player-right {
    display: none;
  }
}

/* ========================================
   МОБИЛЬНЫЕ УСТРОЙСТВА
======================================== */

@media (max-width: 700px) {
  .player {
    /*
     * На телефоне боковая навигация скрыта,
     * нижняя навигация занимает 72px.
     */
    left: 0;
    right: 0;
    bottom: 72px;

    min-height: 73px;

    grid-template-columns:
      minmax(0, 1fr)
      auto;

    gap: 8px;

    padding: 10px 14px;
  }

  .mini-cover {
    width: 42px;
    height: 42px;
  }

  .now-playing {
    gap: 8px;
  }

  .now-info strong {
    font-size: 11px;
  }

  .now-info span {
    font-size: 9px;
  }

  .heart-button {
    display: none;
  }

  .player-center {
    display: flex;
    align-items: center;
    justify-content: end;
  }

  .player-controls {
    gap: 9px;
    margin: 0;
  }

  .player-controls .mode-button {
    min-width: 28px;
    min-height: 28px;
  }

  .player-controls button {
    font-size: 12px;
  }

  .player-controls .play-button {
    width: 34px;
    height: 34px;

    min-width: 34px;
    min-height: 34px;
  }

  .progress-row {
    display: none;
  }

  .player-right {
    display: none;
  }
}

/* ========================================
   ОЧЕНЬ УЗКИЕ ЭКРАНЫ
======================================== */

@media (max-width: 380px) {
  .player {
    padding-right: 9px;
    padding-left: 9px;
    gap: 5px;
  }

  .mini-cover {
    width: 36px;
    height: 36px;
  }

  .player-controls {
    gap: 7px;
  }

  .player-controls .play-button {
    width: 30px;
    height: 30px;

    min-width: 30px;
    min-height: 30px;
  }
}

/* ========================================
   ДОСТУПНОСТЬ
======================================== */

@media (prefers-reduced-motion: reduce) {
  .player *,
  .player *::before,
  .player *::after {
    transition-duration: 0.01ms !important;
  }
}

.device-selector {
  position: relative;
  display: flex;
  align-items: center;
}

.device-button {
  position: relative;
  display: grid;
  place-items: center;

  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;

  border: 0;
  border-radius: 9px;
  padding: 0;

  background: transparent;
  color: #9295a8;

  cursor: pointer;

  transition:
      color 0.2s ease,
      background 0.2s ease,
      box-shadow 0.2s ease;
}

.device-button:hover:not(:disabled) {
  color: #d0c2ff;
  background: rgba(167, 139, 250, 0.10);
}

.device-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.device-button:focus-visible {
  outline: 2px solid #a78bfa80;
  outline-offset: 5px;
}
.device-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 12px);

  width: 270px;
  padding: 14px;

  border: 1px solid #ffffff15;
  border-radius: 12px;

  background: #1c1b29;
  box-shadow: 0 12px 40px #0005;

  z-index: 1000;
}

.device-menu > strong {
  display: block;
  margin-bottom: 12px;

  color: #f5f3fa;
  font-size: 12px;
}

.device-menu p {
  color: #9295a8;
  font-size: 12px;
}

.device-option {
  display: flex;
  align-items: center;
  gap: 10px;

  width: 100%;
  padding: 10px;

  border: 0;
  border-radius: 8px;

  background: transparent;
  color: #c9c7d6;

  text-align: left;
  cursor: pointer;
}

.device-option:hover:not(:disabled) {
  background: #ffffff0c;
}

.device-option-active {
  background: #b39bff15;
  color: #c4b2ff;
}

.device-option-name {
  flex: 1;
  min-width: 0;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  font-size: 12px;
}

.device-option:disabled {
  opacity: 0.5;
  cursor: wait;
}

.device-empty {
  margin: 0;
}

 .queue-toggle {
   position: relative;
   display: inline-flex;
   align-items: center;
   justify-content: center;
   flex-shrink: 0;

   width: 36px;
   height: 36px;
   padding: 0;
   margin-left: 4px;

   border: 1px solid transparent;
   border-radius: 10px;
   background: transparent;
   color: #a09db2;

   cursor: pointer;
   transition: color 0.2s, background 0.2s;
 }

.queue-toggle:hover,
.queue-toggle-active {
  background: #b8a2ff14;
  color: #c4b5fd;
}

.queue-count {
  position: absolute;
  top: -2px;
  right: -4px;

  display: grid;
  place-items: center;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  box-sizing: border-box;

  border-radius: 999px;
  background: #b8a2ff;
  color: #1b1428;

  font-size: 9px;
  font-weight: 700;
}

</style>