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
    </div>

    <!-- Центральное управление -->
    <div class="player-center">
      <div class="player-controls">
        <!-- Предыдущий трек -->
        <button
            type="button"
            aria-label="Предыдущий трек"
            :disabled="
            player.isLoading ||
            !player.currentTrack ||
            player.currentTrackIndex < 0
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

        <!-- Следующий трек -->
        <button
            type="button"
            aria-label="Следующий трек"
            :disabled="
            player.isLoading ||
            !player.currentTrack ||
            player.currentTrackIndex < 0 ||
            player.currentTrackIndex >= player.queue.length - 1
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
            v-model.number="player.progress"
            class="progress"
            type="range"
            min="0"
            :max="player.audioDuration || 1"
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
            @pointerup="player.seekAudio(player.progress)"
            @pointercancel="player.seekAudio(player.progress)"
            @change="player.seekAudio(player.progress)"
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
            class="device-button"
            :disabled="
      player.isDevicesLoading ||
      player.deviceSwitchLoading
    "
            aria-label="Выбрать устройство воспроизведения"
            title="Устройство воспроизведения"
            @click="showDeviceMenu = !showDeviceMenu"
        >
          <span aria-hidden="true">▣</span>
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
    </div>
  </footer>
</template>

<script setup lang="ts">
import usePlayerStore from '@/stores/player';

const player = usePlayerStore();

import { ref, onMounted, watch } from 'vue';


const showDeviceMenu = ref(false);

async function selectDevice(deviceId: number): Promise<void> {
  await player.switchDevice(deviceId);

  showDeviceMenu.value = false;
}

onMounted(() => {
  void player.initializePlayerDevice();
});

watch(
    () => Boolean(player.isServerSyncEnabled),
    (isAuthenticated) => {
      if (isAuthenticated) {
        void player.initializePlayerDevice();
      }
    },
);
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
    gap: 12px;
    margin: 0;
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
  display: grid;
  place-items: center;

  width: 32px;
  height: 32px;

  border: 0;
  border-radius: 8px;

  background: transparent;
  color: #9a9caf;

  cursor: pointer;
  font-size: 19px;
}

.device-button:hover:not(:disabled) {
  background: #ffffff0c;
  color: #d0c2ff;
}

.device-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
</style>