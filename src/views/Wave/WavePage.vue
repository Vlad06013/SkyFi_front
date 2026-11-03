<template>
  <ion-page>
    <AppNavigation />

    <ion-content class="vibe-content">
      <ProfileMenu floating />

      <div class="vibe-blobs" aria-hidden="true">
        <span class="vibe-blob vibe-blob-yellow" />
        <span class="vibe-blob vibe-blob-purple" />
        <span class="vibe-blob vibe-blob-green" />
      </div>

      <div class="vibe-page">
        <section class="vibe-hero">
          <template v-if="!heroDisplay">
            <h1 class="vibe-logo">
              <ion-icon :icon="playOutline" />
              Моя Волна
            </h1>

            <button
                ref="heroPlayRef"
                class="vibe-play"
                type="button"
                :disabled="waveLoading"
                aria-label="Слушать волну"
                @click="playWave"
            >
              <ion-spinner
                  v-if="waveLoading || player.isLoading"
                  name="crescent"
              />
              <ion-icon v-else :icon="playOutline" />
            </button>

            <p
                v-if="waveLoading && !player.waveMode"
                class="vibe-loading"
            >
              Загружаем волну…
            </p>
          </template>

          <template v-else>
            <div class="vibe-cover-wrap">
              <img
                  v-if="heroDisplay.cover"
                  class="vibe-cover"
                  :src="heroDisplay.cover"
                  :alt="heroDisplay.title"
              />
              <div v-else class="vibe-cover vibe-cover-empty">♫</div>
            </div>

            <div
                class="vibe-eq"
                :class="{ 'vibe-eq-on': isPlaying }"
                aria-hidden="true"
            >
              <span v-for="bar in 5" :key="bar" />
            </div>

            <h1 class="vibe-title">{{ heroDisplay.title }}</h1>

            <p class="vibe-artist">{{ heroDisplay.artist }}</p>

            <div class="vibe-controls">
              <button
                  ref="heroPlayRef"
                  class="vibe-play vibe-play-small"
                  type="button"
                  :disabled="waveLoading"
                  aria-label="Слушать волну"
                  @click="playWave"
              >
                <ion-spinner
                    v-if="waveLoading || player.isLoading"
                    name="crescent"
                />
                <ion-icon
                    v-else
                    :icon="isPlaying ? pauseOutline : playOutline"
                />
              </button>
            </div>
          </template>
        </section>

        <div
            v-if="waveError && !player.waveMode && !heroDisplay"
            class="vibe-state vibe-error"
        >
          <p>{{ waveError }}</p>
          <ion-button
              fill="outline"
              size="small"
              @click="loadWave"
          >
            Повторить
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonContent,
  IonIcon,
  IonPage,
  IonSpinner,
} from '@ionic/vue';
import {
  playOutline,
  pauseOutline,
} from 'ionicons/icons';

import { onBeforeUnmount, onMounted, ref } from 'vue';

import AppNavigation from '@/components/AppNavigation.vue';
import ProfileMenu from '@/components/profile/ProfileMenu.vue';
import usePlayerStore from '@/stores/player';
import { useWave } from './wave';

const player = usePlayerStore();

const {
  waveLoading,
  waveError,
  isPlaying,
  heroDisplay,
  loadWave,
  playWave,
} = useWave();

// Кнопка play волны — цель для фокуса с пульта ТВ.
const heroPlayRef = ref<HTMLButtonElement | null>(null);

function isInsideNavigation(target: EventTarget | null): boolean {
  return (
      target instanceof Element
      && target.closest('.app-navigation') !== null
  );
}

/*
 * Пульт Android TV: нативный spatial-фокус редко попадает на
 * кнопку волны (рядом меню, профиль и плеер) — ведём его явно:
 * вправо из бокового меню → кнопка волны, влево с кнопки → меню.
 */
function onWaveKeyDown(event: KeyboardEvent): void {
  if (!(event.target instanceof HTMLElement)) {
    return;
  }

  if (event.key === 'ArrowRight' && isInsideNavigation(event.target)) {
    event.preventDefault();
    heroPlayRef.value?.focus();
    return;
  }

  if (
      event.key === 'ArrowLeft'
      && event.target instanceof HTMLButtonElement
      && event.target.classList.contains('vibe-play')
  ) {
    event.preventDefault();

    const activeNavLink = document.querySelector<HTMLElement>(
        '.app-navigation .nav-link.router-link-active',
    );

    (
        activeNavLink
        ?? document.querySelector<HTMLElement>('.app-navigation .nav-link')
    )?.focus();
  }
}

onMounted(() => {
  document.addEventListener('keydown', onWaveKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onWaveKeyDown);
});
</script>

<style scoped>
.vibe-content {
  --background: #050507;
}

/* Анимированные цветные пятна на весь экран. */
.vibe-blobs {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.vibe-blob {
  position: absolute;
  width: 65vmax;
  height: 65vmax;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.55;
}

.vibe-blob-yellow {
  top: -18vmax;
  left: 50%;
  background: radial-gradient(
      circle,
      rgba(255, 214, 51, 0.85),
      transparent 65%
  );
  animation: vibe-drift 26s ease-in-out infinite alternate;
}

.vibe-blob-purple {
  bottom: -22vmax;
  left: -18vmax;
  background: radial-gradient(
      circle,
      rgba(168, 85, 247, 0.7),
      transparent 65%
  );
  animation: vibe-drift 32s ease-in-out infinite alternate-reverse;
}

.vibe-blob-green {
  right: -20vmax;
  bottom: -14vmax;
  background: radial-gradient(
      circle,
      rgba(34, 197, 94, 0.55),
      transparent 65%
  );
  animation: vibe-drift 38s ease-in-out infinite alternate;
}

@keyframes vibe-drift {
  from { transform: translate(0, 0) scale(1); }
  to { transform: translate(6vmax, -4vmax) scale(1.15); }
}

.vibe-page {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  max-width: 560px;
  margin: 0 auto;
  /* Низ запасаем под фиксированный футер-плеер, иначе hero
   * центрируется на всю высоту и кнопка play уходит под плеер. */
  padding: 72px 24px 160px;
}

/* Кнопка профиля на волне — крупнее стандартной. */
.vibe-content :deep(.profile-button) {
  width: 50px;
  height: 50px;
  font-size: 18px;
}

/* ---------- ЦЕНТРАЛЬНЫЙ БЛОК ---------- */

.vibe-hero {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.vibe-logo {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0;
  color: #f5f3fa;
  font-size: clamp(30px, 7vw, 42px);
  font-weight: 800;
  text-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
}

.vibe-cover-wrap {
  width: min(230px, 60vw);
  aspect-ratio: 1;
  border-radius: 20px;
  box-shadow: 0 26px 70px rgba(0, 0, 0, 0.65);
}

.vibe-cover {
  width: 100%;
  height: 100%;
  border-radius: 20px;
  object-fit: cover;
}

.vibe-cover-empty {
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, #2a2a33, #17171d);
  color: #ffd633;
  font-size: 56px;
}

/* Эквалайзер под обложкой. */
.vibe-eq {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 22px;
  margin-top: 20px;
}

.vibe-eq span {
  width: 4px;
  height: 18%;
  border-radius: 2px;
  background: #ffd633;
  transition: height 0.3s;
}

.vibe-eq-on span {
  animation: vibe-eq 0.85s ease-in-out infinite alternate;
}

.vibe-eq-on span:nth-child(1) { animation-delay: 0s; }
.vibe-eq-on span:nth-child(2) { animation-delay: 0.22s; }
.vibe-eq-on span:nth-child(3) { animation-delay: 0.1s; }
.vibe-eq-on span:nth-child(4) { animation-delay: 0.3s; }
.vibe-eq-on span:nth-child(5) { animation-delay: 0.15s; }

@keyframes vibe-eq {
  from { height: 18%; }
  to { height: 100%; }
}

.vibe-title {
  margin: 16px 0 6px;
  color: #f5f3fa;
  font-size: 24px;
  line-height: 1.2;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.6);
}

.vibe-artist {
  margin: 0;
  color: #cfcfda;
  font-size: 14px;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.6);
}

/* ---------- КНОПКИ ---------- */

.vibe-play {
  display: grid;
  place-items: center;
  width: 84px;
  height: 84px;
  margin-top: 34px;
  border: 0;
  border-radius: 50%;
  background: #ffd633;
  color: #16130a;
  font-size: 36px;
  cursor: pointer;
  box-shadow: 0 12px 32px rgba(255, 214, 51, 0.3);
  transition: transform 0.15s, background 0.2s;
}

.vibe-play:hover:not(:disabled) {
  background: #ffdf5c;
  transform: scale(1.05);
}

.vibe-play:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.vibe-play ion-spinner {
  width: 32px;
  height: 32px;
  color: #16130a;
}

.vibe-controls {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-top: 30px;
}

.vibe-play-small {
  width: 68px;
  height: 68px;
  margin-top: 0;
  font-size: 30px;
}

/* Подпись под кнопкой во время загрузки выдачи. */
.vibe-loading {
  margin: 18px 0 0;
  color: #9295a8;
  font-size: 13px;
}

/* =========================================
   НЕВЫСОКИЕ ЭКРАНЫ (ТВ-БОКСЫ, LANDSCAPE)
   Героический блок компактим, чтобы кнопка
   play не уходила под фиксированный плеер.
========================================= */

@media (max-height: 760px) {
  .vibe-page {
    padding-top: 40px;
    /* Низ держим свободным под мобильный плеер (72px навигация
     * + 68px плеер) с запасом — на ТВ широкий layout, там меньше. */
    padding-bottom: 170px;
  }

  .vibe-logo {
    font-size: clamp(26px, 5vw, 32px);
  }

  .vibe-cover-wrap {
    width: min(190px, 45vw, 32dvh);
  }

  /* Декоративный эквалайзер на низком экране не нужен. */
  .vibe-eq {
    display: none;
  }

  .vibe-title {
    margin-top: 12px;
    font-size: 20px;
  }

  .vibe-artist {
    font-size: 13px;
  }

  .vibe-play {
    width: 72px;
    height: 72px;
    margin-top: 22px;
    font-size: 30px;
  }

  .vibe-controls {
    margin-top: 20px;
  }

  .vibe-play-small {
    width: 60px;
    height: 60px;
    font-size: 26px;
  }
}

@media (max-height: 560px) {
  .vibe-page {
    padding-top: 24px;
    padding-bottom: 150px;
  }

  .vibe-cover-wrap {
    width: min(140px, 40vw, 30dvh);
  }

  .vibe-title {
    margin-top: 10px;
    font-size: 17px;
  }

  .vibe-play {
    width: 60px;
    height: 60px;
    margin-top: 16px;
    font-size: 26px;
  }

  .vibe-controls {
    margin-top: 14px;
  }

  .vibe-play-small {
    width: 52px;
    height: 52px;
    font-size: 22px;
  }
}

/* ---------- СОСТОЯНИЯ ---------- */

.vibe-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #9295a8;
}

.vibe-state p {
  margin: 0;
}

.vibe-error {
  color: #f0a5a5;
}
</style>
