<template>
  <ion-page>
    <AppNavigation />

    <ion-content class="vibe-content">
      <div class="vibe-blobs" aria-hidden="true">
        <span class="vibe-blob vibe-blob-yellow" />
        <span class="vibe-blob vibe-blob-purple" />
        <span class="vibe-blob vibe-blob-green" />
      </div>

      <div class="vibe-page">
        <section
            class="vibe-hero"
            @pointerdown="onHeroPointerDown"
        >
          <!-- Играет не волна (избранное, плейлист, поиск): кнопка
               возврата, как тэг у Яндекса. Жмём — чужой источник
               гасится и запускается волна. -->
          <button
              v-if="showReturnTag"
              ref="returnTagRef"
              type="button"
              class="vibe-return-tag"
              aria-label="Переключиться на волну"
              @click="switchToWave"
          >
            В волну
          </button>

          <template v-if="heroDisplay">
            <!-- Слайдер треков: карточка = обложка + строка трека.
                 При драге сбоку подъезжает соседний трек очереди,
                 недотянул — карточка возвращается на место.
                 Текущая карточка (с аурой) над соседями: они
                 подъезжают под неё и огонь не перекрывают. -->
            <!-- Трек: обложка + плашка. Аура — статичный
                 слой под слайдером, светится сквозь него.
                 Соседи подъезжают сбоку на расстоянии и только
                 пока тянешь; соседа нет — карточки нет. -->
            <div
                ref="trackSliderRef"
                class="vibe-track-slider"
                :class="{ 'vibe-track-dragging': isTrackDragging }"
            >
              <!-- Огненная аура: не двигается с драгом -->
              <div
                  class="vibe-flame"
                  :class="{ 'vibe-flame-on': isPlaying }"
                  aria-hidden="true"
              >
                <span class="vibe-flame-ring" />
                <span class="vibe-flame-tongue vibe-flame-tongue-1" />
                <span class="vibe-flame-tongue vibe-flame-tongue-2" />
                <span class="vibe-flame-tongue vibe-flame-tongue-3" />
              </div>

              <!-- Предыдущий трек: подъедет слева при драге вправо -->
              <div
                  v-if="prevPreview"
                  class="vibe-neighbor vibe-slide"
                  :style="[prevSlideStyle, neighborVisibilityStyle]"
                  aria-hidden="true"
              >
                <div class="vibe-neighbor-cover">
                  <img
                      v-if="prevLine.cover"
                      :src="prevLine.cover"
                      alt=""
                      draggable="false"
                  >
                  <span v-else>♫</span>
                </div>
                <div class="vibe-card-line">
                  <span class="vibe-card-text">
                    {{ prevLine.artist }} — {{ prevLine.title }}
                  </span>
                </div>
              </div>

              <!-- Следующий трек: подъедет справа при драге влево -->
              <div
                  v-if="nextPreview"
                  class="vibe-neighbor vibe-slide"
                  :style="[nextSlideStyle, neighborVisibilityStyle]"
                  aria-hidden="true"
              >
                <div class="vibe-neighbor-cover">
                  <img
                      v-if="nextLine.cover"
                      :src="nextLine.cover"
                      alt=""
                      draggable="false"
                  >
                  <span v-else>♫</span>
                </div>
                <div class="vibe-card-line">
                  <span class="vibe-card-text">
                    {{ nextLine.artist }} — {{ nextLine.title }}
                  </span>
                </div>
              </div>

              <!-- Текущий трек: обложка + плашка с прогрессом -->
              <div
                  class="vibe-card-current vibe-slide"
                  :style="currentSlideStyle"
              >
                <button
                    type="button"
                    class="vibe-cover-wrap"
                    :disabled="!canOpenTrack"
                    :aria-label="`Открыть карточку трека: ${heroDisplay.artist} — ${heroDisplay.title}`"
                    @click="openTrackCard()"
                >
                  <img
                      v-if="heroDisplay.cover"
                      class="vibe-cover"
                      :src="heroDisplay.cover"
                      :alt="heroDisplay.title"
                      draggable="false"
                      @dragstart.prevent
                  />
                  <div v-else class="vibe-cover vibe-cover-empty">♫</div>
                </button>

                <!-- Плашка: прогресс, клик — карточка, сердечко — лайк -->
                <div
                    class="vibe-pill"
                    :class="{ 'vibe-pill-clickable': canOpenTrack }"
                    role="button"
                    :tabindex="canOpenTrack ? 0 : undefined"
                    :aria-label="`Открыть карточку трека: ${heroDisplay.artist} — ${heroDisplay.title}`"
                    @click="openTrackCard()"
                    @keydown.enter.prevent="openTrackCard()"
                    @keydown.space.prevent="openTrackCard()"
                >
                  <span
                      class="vibe-pill-fill"
                      :style="{ width: `${pillProgress}%` }"
                      aria-hidden="true"
                  />
                  <span class="vibe-pill-text">
                    {{ heroDisplay.artist }} — {{ heroDisplay.title }}
                  </span>

                  <button
                      v-if="canOpenTrack"
                      type="button"
                      class="vibe-like"
                      :class="{ 'vibe-like-active': player.liked }"
                      :disabled="player.favoriteLoading"
                      :aria-label="player.liked ? 'Убрать из избранного' : 'В избранное'"
                      @click.stop="player.toggleFavorite()"
                  >
                    <ion-icon :icon="player.liked ? heart : heartOutline" />
                  </button>
                </div>
              </div>
            </div>
          </template>

          <button
              ref="heroPlayRef"
              class="vibe-play"
              type="button"
              :disabled="playBusy"
              :aria-label="isPlaying ? 'Пауза' : 'Слушать'"
              @click="playWave"
          >
            <ion-spinner
                v-if="playBusy"
                name="crescent"
            />
            <ion-icon
                v-else
                :icon="isPlaying ? pauseOutline : playOutline"
            />
          </button>

          <p
              v-if="waveInitialLoading"
              class="vibe-loading"
          >
            Загружаем волну…
          </p>
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

        <!-- Офлайн без скачанных: волна недоступна, играть нечего. -->
        <div
            v-if="offlineMode && !heroDisplay"
            class="vibe-state vibe-offline"
        >
          <p>Нет сети — волна недоступна.</p>
          <p>Скачанных треков тоже нет.</p>
          <p>Подключись к интернету — волна загрузится сама.</p>
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
  heart,
  heartOutline,
} from 'ionicons/icons';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';

import AppNavigation from '@/components/AppNavigation.vue';
import usePlayerStore from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import { useNetworkStore } from '@/stores/network';
import type { Track } from '@/types/TrackType';
import { useWave } from './wave';

const player = usePlayerStore();
const ui = useUiStore();
const network = useNetworkStore();

const {
  waveTracks,
  waveLoading,
  waveError,
  offlineMode,
  isPlaying,
  heroDisplay,
  loadWave,
  playWave,
  switchToWave,
} = useWave();

/**
 * Карточку открываем только для реально играющего трека:
 * в тишине плашка показывает первый трек свежей выдачи,
 * которого в плеере ещё нет.
 */
const canOpenTrack = computed(
    () => player.currentTrack !== null,
);

/** Заполнение плашки: прогресс текущего трека (волны или чужого). */
const pillProgress = computed(() =>
    player.currentTrack ? player.progressPercent : 0,
);

/** Ждём первую порцию волны: список пуст и в плеере тишина. */
const waveInitialLoading = computed(
    () =>
        waveLoading.value
        && waveTracks.value.length === 0
        && !player.currentTrack,
);

/**
 * Спиннер и блокировка кнопки play — только осмысленное
 * ожидание: первая порция волны или старт/переключение трека.
 * Фоновые перезагрузки выдачи (вход на страницу, авторизация)
 * спиннера не дают.
 */
const playBusy = computed(
    () => waveInitialLoading.value || player.isLoading,
);

/** В плеере звучит не волна (избранное, плейлист...) — показываем кнопку «В волну». Офлайн она бессмысленна: волна недоступна. */
const showReturnTag = computed(
    () =>
        !player.waveMode
        && player.currentTrack !== null
        && network.isOnline,
);

// ============================================
// СЛАЙДЕР ТРЕКОВ
//
// Драг по обложке/плашке: сбоку подъезжает соседний
// трек текущей очереди (волна или чужой источник).
// Не дотянул — обложка возвращается.
// Логика зеркалит слайдер мини-плеера (AudioPlayer).
// ============================================

const trackSliderRef = ref<HTMLElement | null>(null);

const heroSwipe = ref<{
  x: number;
  y: number;
  pointerId: number;
} | null>(null);

const dragOffset = ref(0);
const isTrackDragging = ref(false);
const slideCommit = ref<null | 'next' | 'prev'>(null);

/** Свайп сработал: следующий клик по обложке/плашке игнорим. */
let swipeFired = false;

/** Соседние треки для подъезжающих обложек. */
function sideLine(track: Track | null, fallbackTitle: string): {
  title: string;
  artist: string;
  cover: string | null;
} {
  if (!track) {
    return { title: fallbackTitle, artist: '—', cover: null };
  }

  return {
    title: track.title,
    artist:
        track.meta?.artists?.map(artist => artist.name).join(', ')
        || 'Неизвестный исполнитель',
    cover: track.meta?.album?.cover_path ?? null,
  };
}

/* Соседних треков нет — карточки нет: заглушки не рисуем.
 * Соседи из текущей очереди плеера: волна или чужой источник. */
const prevPreview = computed<Track | null>(() =>
    player.currentTrack ? player.previewPreviousTrack : null,
);

const nextPreview = computed<Track | null>(() =>
    player.currentTrack ? player.previewNextTrack : null,
);

const prevLine = computed(() =>
    sideLine(prevPreview.value, 'Предыдущий трек'),
);

const nextLine = computed(() =>
    sideLine(nextPreview.value, 'Следующий трек'),
);

const currentSlideStyle = computed(() => ({
  transform: `translate3d(${dragOffset.value}px, 0, 0)`,
}));

/* Зазор 64px между карточками: сосед подъезжает рядом,
 * под текущий не залезает. */
const prevSlideStyle = computed(() => ({
  transform: `translate3d(calc(-100% - 64px + ${dragOffset.value}px), 0, 0)`,
}));

const nextSlideStyle = computed(() => ({
  transform: `translate3d(calc(100% + 64px + ${dragOffset.value}px), 0, 0)`,
}));

/* Соседние слайды невидимы, пока не потянул: в покое за
 * краями вьюпорта их и не видно, но и подглядеть/мелькнуть
 * при переходах нельзя — только при драге или вылете
 * завершённого свайпа. */
const neighborVisibilityStyle = computed<CSSProperties>(() => ({
  visibility:
      isTrackDragging.value || slideCommit.value !== null
          ? 'visible'
          : 'hidden',
}));

function onHeroPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return;
  }

  // Пока обложка вылетает по завершённому свайпу — жест не начинаем.
  if (slideCommit.value) {
    return;
  }

  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  // Кнопки управления свайпом не трогаем: у них свои нажатия.
  if (target.closest('.vibe-like, .vibe-play, .vibe-return-tag, a, input')) {
    return;
  }

  swipeFired = false;

  heroSwipe.value = {
    x: event.clientX,
    y: event.clientY,
    pointerId: event.pointerId,
  };
}

function onHeroPointerMove(event: PointerEvent): void {
  const start = heroSwipe.value;

  if (!start || start.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - start.x;
  const deltaY = event.clientY - start.y;

  if (!isTrackDragging.value) {
    // Ждём явного горизонтального сдвига; вертикаль
    // оставляем прокрутке страницы.
    if (Math.abs(deltaX) < 10 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) {
      return;
    }

    if (!player.currentTrack) {
      return;
    }

    isTrackDragging.value = true;
  }

  dragOffset.value = deltaX;
}

function onHeroPointerUp(event: PointerEvent): void {
  const start = heroSwipe.value;

  heroSwipe.value = null;

  if (!start || start.pointerId !== event.pointerId) {
    return;
  }

  if (!isTrackDragging.value) {
    return;
  }

  isTrackDragging.value = false;

  releaseTrackDrag(event.clientX - start.x);
}

function releaseTrackDrag(deltaX: number): void {
  const width = trackSliderRef.value?.clientWidth ?? 300;
  const threshold = Math.min(60, width * 0.3);

  if (
      Math.abs(deltaX) < threshold ||
      !player.currentTrack ||
      player.isLoading
  ) {
    // Не дотянул — обложка возвращается на место.
    dragOffset.value = 0;
    return;
  }

  swipeFired = true;

  const direction = deltaX < 0 ? 'next' : 'prev';

  slideCommit.value = direction;
  dragOffset.value = direction === 'next' ? -width : width;

  if (direction === 'next') {
    void player.playNext();
  } else {
    void player.playPrevious();
  }

  // Страховка: если трек не сменился — возвращаем обложку.
  setTimeout(() => {
    if (slideCommit.value === direction) {
      slideCommit.value = null;
      dragOffset.value = 0;
    }
  }, 500);
}

function onHeroPointerCancel(event: PointerEvent): void {
  if (heroSwipe.value && heroSwipe.value.pointerId !== event.pointerId) {
    return;
  }

  heroSwipe.value = null;

  if (isTrackDragging.value) {
    isTrackDragging.value = false;
    dragOffset.value = 0;
  }
}

// Трек сменился: позиции сбрасываем без анимации — на экране
// уже тот трек, что подъехал сбоку.
watch(() => player.currentTrack?.id, () => {
  if (dragOffset.value === 0 && !slideCommit.value) {
    return;
  }

  slideCommit.value = null;
  dragOffset.value = 0;
  isTrackDragging.value = true;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      isTrackDragging.value = false;
    });
  });
});

function openTrackCard(): void {
  if (swipeFired) {
    swipeFired = false;
    return;
  }

  ui.openTrackDetails();
}

// Кнопки страницы — цели для фокуса с пульта ТВ.
const heroPlayRef = ref<HTMLButtonElement | null>(null);
const returnTagRef = ref<HTMLButtonElement | null>(null);

function isInsideNavigation(target: EventTarget | null): boolean {
  return (
      target instanceof Element
      && target.closest('.app-navigation') !== null
  );
}

function focusActiveNavLink(): void {
  const activeNavLink = document.querySelector<HTMLElement>(
      '.app-navigation .nav-link.router-link-active',
  );

  (
      activeNavLink
      ?? document.querySelector<HTMLElement>('.app-navigation .nav-link')
  )?.focus();
}

/*
 * Пульт Android TV: нативный spatial-фокус редко попадает на
 * кнопки страницы (рядом меню, профиль и плеер) — ведём его явно:
 * вправо из меню → «В волну» (если видна) → кнопка волны,
 * влево — обратно по той же цепочке.
 */
function onWaveKeyDown(event: KeyboardEvent): void {
  if (!(event.target instanceof HTMLElement)) {
    return;
  }

  if (event.key === 'ArrowRight' && isInsideNavigation(event.target)) {
    event.preventDefault();

    if (showReturnTag.value) {
      returnTagRef.value?.focus();
    } else {
      heroPlayRef.value?.focus();
    }

    return;
  }

  if (event.key === 'ArrowRight' && event.target === returnTagRef.value) {
    event.preventDefault();
    heroPlayRef.value?.focus();
    return;
  }

  if (event.key === 'ArrowLeft' && event.target === returnTagRef.value) {
    event.preventDefault();
    focusActiveNavLink();
    return;
  }

  if (
      event.key === 'ArrowLeft'
      && event.target instanceof HTMLButtonElement
      && event.target.classList.contains('vibe-play')
  ) {
    event.preventDefault();

    if (showReturnTag.value) {
      returnTagRef.value?.focus();
    } else {
      focusActiveNavLink();
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', onWaveKeyDown);

  // Драг может увести палец за пределы hero — слушаем window.
  window.addEventListener('pointermove', onHeroPointerMove);
  window.addEventListener('pointerup', onHeroPointerUp);
  window.addEventListener('pointercancel', onHeroPointerCancel);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onWaveKeyDown);

  window.removeEventListener('pointermove', onHeroPointerMove);
  window.removeEventListener('pointerup', onHeroPointerUp);
  window.removeEventListener('pointercancel', onHeroPointerCancel);
});
</script>

<style scoped>
.vibe-content {
  --background: #050507;
  /* Страница статична: контент помещается в экран,
   * скролл не нужен. */
  --overflow: hidden;
}

/* Глобальный отступ под шапку (variables.css) на волне
 * не нужен: страница сама резервирует место шапки и нижней
 * навигации в своих отступах. Специфичность — выше
 * глобальных правил app--top-bar / app--bottom-nav. */
body.app--top-bar .vibe-content,
body.app--bottom-nav .vibe-content {
  --padding-top: 0;
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
  padding-right: 24px;
  padding-left: 24px;
  /* Верх — под шапку (профиль/поиск) и статус-бар, низ — под
   * нижнюю навигацию (телефон/ТВ-режим): высоты берутся из
   * переменных и ужимаются на низких экранах. Футер-плеер
   * на волне скрыт, больший отступ не нужен. */
  padding-top: calc(var(--app-top-bar-height, 54px) + var(--app-safe-top, 0px) + 18px);
  padding-bottom: calc(var(--app-bottom-nav-height, 72px) + 16px);
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

/* ---------- ОБЛОЖКА И ОГНЕННАЯ АУРА ---------- */

/* Горизонтальный драг по треку — наш жест, вертикаль
 * остаётся прокрутке страницы. */
.vibe-hero {
  touch-action: pan-y;
}

/* ---------- КНОПКА «В ВОЛНУ» ---------- */

/* Плашка над блоком трека, пока в плеере звучит не волна:
 * избранное, плейлист, поиск. Жмём — чужой источник
 * гасится и запускается волна. В потоке hero — едет
 * вместе с карточкой; z-index — поверх огненной ауры. */
.vibe-return-tag {
  position: relative;
  z-index: 2;

  margin: 0 auto 22px;
  padding: 11px 24px;

  border: 1px solid #ffffff14;
  border-radius: 999px;

  background: #14131bd9;
  backdrop-filter: blur(10px);

  color: #f5f3fa;
  font-size: 14px;
  font-weight: 700;

  cursor: pointer;

  transition: background 0.2s, transform 0.15s;
}

.vibe-return-tag:hover {
  background: #1d1c27e6;
}

.vibe-return-tag:active {
  transform: scale(0.96);
}

.vibe-return-tag:focus-visible {
  outline: 3px solid #c4b5fd;
  outline-offset: 3px;
}

/* Вьюпорт слайдера. По бокам — 32px под свечение ауры,
 * сверху — 26px под верхний язык пламени: overflow:hidden
 * их не обрезает. */
/* Слайдер трека. БЕЗ overflow — ничего не обрезаем:
 * ни плашку, ни тень, ни ауру. Соседи за краями скрыты
 * visibility, а не клиппингом. */
.vibe-track-slider {
  --vibe-cover-size: min(230px, 60vw);

  position: relative;

  width: calc(var(--vibe-cover-size) + 64px);
  margin: 6px auto 0;
  padding-top: 26px;
}

/* Плавное движение после отпускания; во время драга —
 * без анимации, следует за пальцем. */
.vibe-slide {
  transition: transform 0.28s cubic-bezier(0.25, 0.8, 0.3, 1);
}

.vibe-track-dragging .vibe-slide {
  transition: none;
}

/* Текущий трек: в потоке, над аурой и соседями. */
.vibe-card-current {
  position: relative;
  z-index: 2;

  width: var(--vibe-cover-size);
  margin: 0 auto;
}

/* Соседние треки: за краями, подъезжают на расстоянии
 * 64px — под текущий не залезают. */
.vibe-neighbor {
  position: absolute;
  top: 26px;
  left: 32px;
  z-index: 1;

  width: var(--vibe-cover-size);

  pointer-events: none;
}

.vibe-neighbor-cover {
  display: grid;
  place-items: center;

  aspect-ratio: 1;

  overflow: hidden;

  border-radius: 20px;

  background: linear-gradient(145deg, #23222c, #15151b);

  color: #ffd633;
  font-size: 40px;
}

.vibe-neighbor-cover img {
  width: 100%;
  height: 100%;

  object-fit: cover;

  -webkit-user-drag: none;
  user-select: none;
}

/* Строка соседнего трека: по ширине обложки. */
.vibe-card-line {
  display: flex;
  align-items: center;
  justify-content: center;

  min-height: 60px;
  margin-top: 14px;
  padding: 8px 14px;

  box-sizing: border-box;

  border: 1px solid #ffffff12;
  border-radius: 999px;

  background: #14131bcc;
}

.vibe-card-text {
  overflow: hidden;

  color: #b9b6c6;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Плашка текущего трека: широкая, вылезает за обложку
 * (overflow нет — не обрезается). Название влезает
 * целиком. Центрируется на карточке через translate. */
.vibe-pill {
  position: relative;

  display: flex;
  align-items: center;
  gap: 12px;

  width: min(340px, calc(100vw - 48px));
  min-height: 60px;
  margin-top: 14px;
  margin-left: 50%;

  transform: translateX(-50%);

  padding: 8px 10px 8px 24px;

  box-sizing: border-box;

  border: 1px solid #ffffff14;
  border-radius: 999px;

  background: #14131bcc;

  overflow: hidden;
}

/* Аура: вращающееся кольцо тепла и языки пламени.
 * В покое — тлеет (приглушена), при воспроизведении
 * оживает (класс vibe-flame-on). */
/* Аура — СТАТИЧНЫЙ слой ПОД слайдером: огонь «тлеет» на
 * месте текущего трека, светится сквозь слайдер вокруг
 * обложки; с драгом не двигается и ничем не обрезана. */
.vibe-flame {
  position: absolute;
  top: 26px;
  left: 32px;
  z-index: 0;

  width: var(--vibe-cover-size);
  aspect-ratio: 1;

  /* В 2 раза больше обложки — растём из центра,
   * совпадающего с центром обложки. */
  transform: scale(2);
  transform-origin: center;

  pointer-events: none;

  opacity: 0.3;

  transition: opacity 0.7s ease;
}

.vibe-flame-on {
  opacity: 1;
}

/* Кольцо: размытый вращающийся конус цвета. */
.vibe-flame-ring {
  position: absolute;
  inset: -4px;

  border-radius: 30px;

  background: conic-gradient(
      from 0deg,
      transparent 0deg,
      #ffd633 55deg,
      #ff7a18 100deg,
      transparent 155deg,
      transparent 185deg,
      #ff4d8d 240deg,
      #a855f7 290deg,
      transparent 345deg
  );

  /* Сильное размытие: кольцо читается как тёплое свечение,
   * а не как очертание рамки. */
  filter: blur(22px) saturate(1.25);
}

.vibe-flame-on .vibe-flame-ring {
  animation:
      vibe-flame-spin 7s linear infinite,
      vibe-flame-pulse 1.7s ease-in-out infinite alternate;
}

/* Языки пламени по углам — дёргаются с разным ритмом. */
.vibe-flame-tongue {
  position: absolute;

  width: 48%;
  aspect-ratio: 1;

  border-radius: 50%;

  filter: blur(13px);
}

.vibe-flame-tongue-1 {
  top: -8%;
  left: -9%;

  background: radial-gradient(
      circle at 60% 60%,
      #ffd633cc,
      #ff7a1859 55%,
      transparent 72%
  );
}

.vibe-flame-tongue-2 {
  right: -11%;
  bottom: 0;

  background: radial-gradient(
      circle at 40% 40%,
      #ff4d8dbb,
      #a855f759 55%,
      transparent 72%
  );
}

.vibe-flame-tongue-3 {
  bottom: -14%;
  left: 16%;

  background: radial-gradient(
      circle at 50% 40%,
      #ff7a18cc,
      #ffd63342 58%,
      transparent 75%
  );
}

.vibe-flame-on .vibe-flame-tongue-1 {
  animation: vibe-flame-lick 1.5s ease-in-out infinite alternate;
}

.vibe-flame-on .vibe-flame-tongue-2 {
  animation: vibe-flame-lick 2.1s ease-in-out -0.6s infinite alternate;
}

.vibe-flame-on .vibe-flame-tongue-3 {
  animation: vibe-flame-lick 1.8s ease-in-out -1.1s infinite alternate;
}

@keyframes vibe-flame-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes vibe-flame-pulse {
  from {
    opacity: 0.65;
  }

  to {
    opacity: 1;
  }
}

@keyframes vibe-flame-lick {
  from {
    opacity: 0.6;
    transform: translateY(5%) scale(0.92);
  }

  to {
    opacity: 1;
    transform: translateY(-7%) scale(1.1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .vibe-flame-ring,
  .vibe-flame-tongue {
    animation: none !important;
  }
}

/* Обложка текущего трека. Кнопка: клик открывает карточку. */
.vibe-cover-wrap {
  position: relative;

  display: block;

  width: 100%;
  aspect-ratio: 1;

  padding: 0;

  border: 0;
  border-radius: 20px;

  background: transparent;

  /* Мягкая тень без длинного хвоста: не обрезается
   * нижним краем вьюпорта слайдера. */
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.55);

  cursor: pointer;
}

.vibe-cover-wrap:disabled {
  cursor: default;
}

.vibe-cover-wrap:focus-visible {
  outline: 3px solid #c4b5fd;
  outline-offset: 4px;
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

/* Плашка текущего трека под кнопкой волны: фон
 * заполняется по мере прослушивания. */


.vibe-pill-clickable {
  cursor: pointer;
}

.vibe-pill-clickable:focus-visible {
  outline: 3px solid #c4b5fd;
  outline-offset: 3px;
}

/* Заливка прогресса: растёт слева направо за текстом. */
.vibe-pill-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;

  width: 0;

  background: linear-gradient(
      90deg,
      #ffd6331f,
      #ffd63342
  );

  transition: width 0.3s linear;

  pointer-events: none;
}

.vibe-pill-text {
  position: relative;

  flex: 1;
  min-width: 0;

  overflow: hidden;

  color: #f5f3fa;
  font-size: 14px;
  font-weight: 700;
  text-align: center;
  text-overflow: ellipsis;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  white-space: nowrap;
}

.vibe-like {
  position: relative;

  display: grid;
  place-items: center;

  flex: 0 0 44px;

  width: 44px;
  height: 44px;
  padding: 0;

  border: 0;
  border-radius: 50%;

  background: #ffffff12;
  color: #e8e6f2;

  font-size: 20px;

  cursor: pointer;

  transition:
      background 0.2s,
      color 0.2s,
      transform 0.15s;
}

.vibe-like:hover:not(:disabled) {
  background: #ffffff22;
  transform: scale(1.08);
}

.vibe-like-active {
  color: #ffd633;
}

.vibe-like:disabled {
  opacity: 0.6;
  cursor: wait;
}

.vibe-like:focus-visible {
  outline: 3px solid #c4b5fd;
  outline-offset: 2px;
}

/* ---------- КНОПКИ ---------- */

.vibe-play {
  /* Поверх огненной ауры: пламя размазано за пределы
   * слайдера и перекрывало бы кнопку. */
  position: relative;
  z-index: 2;

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

/* Подпись под кнопкой во время загрузки выдачи. */
.vibe-loading {
  margin: 18px 0 0;
  color: #9295a8;
  font-size: 13px;
}

/* =========================================
   НЕВЫСОКИЕ ЭКРАНЫ (ТВ-БОКСЫ, МАГНИТОЛЫ, LANDSCAPE)
   Героический блок компактим, чтобы целиком
   помещаться между шапкой и нижней навигацией.
========================================= */

@media (max-height: 760px) {
  /* Воздух под шапкой ужимаем; низ сам подстроится —
   * высота нижней навигации берётся из переменной. */
  .vibe-page {
    padding-top: calc(var(--app-top-bar-height, 54px) + var(--app-safe-top, 0px) + 8px);
  }

  .vibe-return-tag {
    margin-bottom: 16px;
  }

  .vibe-track-slider {
    --vibe-cover-size: min(190px, 45vw, 32dvh);
    margin-top: 2px;
  }

  .vibe-play {
    width: 72px;
    height: 72px;
    margin-top: 22px;
    font-size: 30px;
  }

  .vibe-pill {
    min-height: 54px;
    margin-top: 20px;
  }
}

@media (max-height: 560px) {
  .vibe-return-tag {
    margin-bottom: 12px;
    padding: 9px 20px;
  }

  .vibe-track-slider {
    --vibe-cover-size: min(140px, 40vw, 30dvh);
    margin-top: 0;
  }

  .vibe-play {
    width: 60px;
    height: 60px;
    margin-top: 16px;
    font-size: 26px;
  }

  .vibe-pill {
    margin-top: 14px;
  }
}

/* Совсем низкие экраны (800×480 магнитолы): блок трека
 * ужимаем до минимума, чтобы целиком помещаться между
 * шапкой и нижней навигацией. */
@media (max-height: 500px) {
  .vibe-return-tag {
    margin-bottom: 8px;
    padding: 8px 18px;
  }

  .vibe-track-slider {
    --vibe-cover-size: min(110px, 30dvh);
    padding-top: 18px;
  }

  .vibe-play {
    width: 52px;
    height: 52px;
    margin-top: 12px;
    font-size: 24px;
  }

  .vibe-pill {
    min-height: 46px;
    margin-top: 10px;
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
