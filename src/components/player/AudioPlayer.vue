<template>
  <footer class="player">
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
          aria-label="Избранное"
      >
        {{ player.liked ? '♥' : '♡' }}
      </button>
    </div>

    <div class="player-center">
      <div class="player-controls">
        <button aria-label="Предыдущий трек" disabled>
          |◀
        </button>

        <button
            class="play-button"
            :disabled="player.isLoading || !player.currentTrack"
            :aria-label="player.isPlaying ? 'Пауза' : 'Воспроизвести'"
            @click="player.togglePlay()"
        >
          {{ player.isLoading ? '…' : player.isPlaying ? 'Ⅱ' : '▶' }}
        </button>

        <button aria-label="Следующий трек" disabled>
          ▶|
        </button>
      </div>

      <div class="progress-row">
        <span>{{ player.formatTime(player.progress) }}</span>

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
            @pointerdown="player.isSeeking = true"
            @change="player.seekAudio(player.progress)"
        />

        <span>{{ player.formatTime(player.audioDuration) }}</span>
      </div>
    </div>

    <div class="player-right">
      <span>♫</span>

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
import { usePlayerStore } from '@/stores/player';

const player = usePlayerStore();
</script>

<style scoped>
/* =========================
   НИЖНИЙ АУДИОПЛЕЕР
========================= */

.player {
  position: fixed;
  inset: auto 0 0;
  z-index: 20;
  min-height: 91px;
  display: grid;
  grid-template-columns: 1fr 1.1fr 1fr;
  align-items: center;
  gap: 20px;
  padding: 13px 27px;
  border-top: 1px solid #ffffff12;
  background: rgba(17, 18, 27, 0.97);
  backdrop-filter: blur(20px);
}

/* Информация о текущем треке */

.now-playing {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.mini-cover {
  width: 49px;
  height: 49px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 8px;
  color: white;
  font-size: 22px;
}

.mini-empty {
  background: #272238;
}

.now-info {
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

/* Кнопка избранного */

.heart-button {
  border: 0;
  background: transparent;
  color: #9295a8;
  cursor: pointer;
  font-size: 22px;
}

.heart-button:hover {
  color: #d5c5ff;
}

.heart-button.liked {
  color: #e88bae;
}

/* Центральная область */

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
  border: 0;
  background: transparent;
  color: #9295a8;
  cursor: pointer;
  font-size: 13px;
  transition: color 0.2s;
}

.player-controls button:hover {
  color: #d0c2ff;
}

.player-controls .play-button {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #b8a2ff;
  color: #1b1428;
  font-size: 13px;
}

.player-controls .play-button:hover {
  background: #c9baff;
  color: #1b1428;
}

/* Прогресс воспроизведения */

.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.progress-row > span {
  flex-shrink: 0;
  min-width: 35px;
  font-size: 11px;
  color: #9292a8;
  font-variant-numeric: tabular-nums;
}

.progress-row > span:last-child {
  text-align: right;
}

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

/* Ползунок: Chrome, Safari, Edge */

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

/* Ползунок: Firefox */

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

/* Фокус с клавиатуры */

.progress:focus-visible,
.player-right input:focus-visible {
  outline: 2px solid #a78bfa80;
  outline-offset: 5px;
}

/* Громкость */

.player-right {
  display: flex;
  align-items: center;
  justify-content: end;
  gap: 12px;
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

/* =========================
   АДАПТИВНОСТЬ ПЛЕЕРА
========================= */

/* Планшеты */

@media (max-width: 1050px) {
  .player {
    grid-template-columns: 1fr 1fr;
  }

  .player-right {
    display: none;
  }
}

/* Мобильные устройства */

@media (max-width: 650px) {
  .player {
    bottom: 61px;
    min-height: 73px;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding: 10px 14px;
  }

  .mini-cover {
    width: 42px;
    height: 42px;
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
    margin: 0;
    gap: 12px;
  }

  .player-controls button:first-child {
    display: none;
  }

  .progress-row {
    display: none;
  }
}
</style>
