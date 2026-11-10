<template>
  <BaseInfiniteList
      :items="items"
      :loading="loading"
      :loading-more="false"
      :has-more="hasMore"
      :error="error"
      :get-key="track => track.id"
      :load-more="loadMore"
      :retry="async () => {
        await props.retry();
      }"
  >
    <template #item="{ item: track, index }">
      <div
          :ref="el => setRowEl(index, el)"
          class="track-row"
          role="button"
          tabindex="0"
          :aria-label="`Воспроизвести: ${track.title}`"
          :class="{
          'track-row-active': isCurrentTrack(track),
          'track-row-menu-open':
            openMenuTrackId === String(track.id),
          'is-dragging': draggingIndex === index,
          'track-row-offline-unavailable': isUnavailableOffline(track),
        }"
          @click="onRowClick(track)"
          @keydown="onRowKeyDown($event, track)"
      >
        <button
            type="button"
            tabindex="-1"
            class="drag-handle"
            aria-label="Перетащить, чтобы изменить порядок"
            @click.stop
            @pointerdown="onDragHandlePointerDown($event, index)"
        >
          <ion-icon :icon="reorderTwoOutline" />
        </button>

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
        </div>

        <span
            class="source-badge"
            :class="getSourceTypeClass(track.source_type)"
        >
          {{ getSourceTypeLabel(track.source_type) }}
        </span>

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
            movable-to-top
            @open="handleMenuOpen"
            @close="handleMenuClose"
            @action="handleAction"
            @move-to-top="handleMoveToTop"
        />
      </div>
    </template>
  </BaseInfiniteList>
</template>

<script setup lang="ts">
import '@/components/track-menu/track-list.css';

import {computed, onBeforeUnmount, watch, ref} from 'vue';
import {IonIcon, toastController} from '@ionic/vue';
import {
  musicalNotesOutline,
  pauseOutline,
  playOutline,
  reorderTwoOutline,
} from 'ionicons/icons';

import BaseInfiniteList from '@/components/lists/BaseInfiniteList.vue';
import TrackContextMenu from '@/components/track-menu/TrackContextMenu.vue';
import usePlayerStore from '@/stores/player';
import {useDownloadsStore} from '@/stores/downloads';
import {useNetworkStore} from '@/stores/network';

// import { getFavorites } from '@/api/favorites';
import type {Track} from '@/types/TrackType';
import {PlaySourceListsEnum} from '@/types/PlaySourceListsEnum';

const player = usePlayerStore();
const downloads = useDownloadsStore();
const network = useNetworkStore();

/** Офлайн и трек не скачан — воспроизвести нельзя. */
function isUnavailableOffline(track: Track): boolean {
  return !network.isOnline && !downloads.isDownloaded(track);
}

let offlineToastAt = 0;

async function notifyUnavailableOffline(): Promise<void> {
  // Не душим тостами при быстрых кликах.
  if (Date.now() - offlineToastAt < 1500) return;

  offlineToastAt = Date.now();

  const toast = await toastController.create({
    message: 'Трек не скачан — офлайн недоступен',
    duration: 2000,
    position: 'top',
    cssClass: 'player-toast',
  });

  await toast.present();
}

const loadingTrackId = ref<number | null>(null);
const openMenuTrackId = ref<string | null>(null);

const emit = defineEmits<{
  play: [track: Track];
  action: [
    track: Track,
    action: 'next' | 'queue' | 'favorite',
  ];
  menuOpen: [track: Track];
  reorder: [fromIndex: number, toIndex: number];
  moveToTop: [track: Track];
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
const sourceList = PlaySourceListsEnum.FAVORITES;

function isCurrentTrack(track: Track): boolean {
  return Number(player.currentTrack?.id) === Number(track.id);
}

async function playTrack(track: Track): Promise<void> {
  if (!track?.id || player.isLoading) return;

  // Офлайн без скачанного файла — не запускаем.
  if (isUnavailableOffline(track)) {
    await notifyUnavailableOffline();
    return;
  }

  console.log('playTrack', track, sourceList);
  // Повторный клик по текущему треку — пауза/продолжение,
  // а не перезапуск с начала.
  if (isCurrentTrack(track)) {
    await player.togglePlay(sourceList);
    return;
  }

  player.setQueue([...props.queueTracks], sourceList);

  console.log('[Favorites] Очередь перед запуском:', {
    list: sourceList,
    count: props.queueTracks.length,
    ids: props.queueTracks.map(item => item.id),
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

function handleMoveToTop(track: Track): void {
  emit('moveToTop', track);
}

// ============================================
// ПЕРЕТАСКИВАНИЕ (drag & drop) ДЛЯ СОРТИРОВКИ
// ============================================

const draggingIndex = ref<number | null>(null);
const rowEls = new Map<number, HTMLElement>();

interface DragState {
  pointerId: number;
  startIndex: number;
  targetIndex: number;
  lastClientY: number;
  rowTops: number[];
  rowHeights: number[];
  scrollEl: HTMLElement | null;
  startScrollTop: number;
  rafId: number | null;
  handle: HTMLElement | null;
}

let dragState: DragState | null = null;

function setRowEl(index: number, el: unknown): void {
  if (el instanceof HTMLElement) {
    rowEls.set(index, el);
  } else {
    rowEls.delete(index);
  }
}

function onDragHandlePointerDown(
    event: PointerEvent,
    index: number,
): void {
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return;
  }

  if (props.items.length < 2 || dragState) {
    return;
  }

  const handle = event.currentTarget as HTMLElement;
  const count = props.items.length;
  const rowTops: number[] = [];
  const rowHeights: number[] = [];

  for (let i = 0; i < count; i++) {
    const el = rowEls.get(i);

    // Строки ещё не отрисованы — перетаскивание не начинаем.
    if (!el) {
      return;
    }

    const rect = el.getBoundingClientRect();

    rowTops[i] = rect.top;
    rowHeights[i] = rect.height;
  }

  const state: DragState = {
    pointerId: event.pointerId,
    startIndex: index,
    targetIndex: index,
    lastClientY: event.clientY,
    rowTops,
    rowHeights,
    scrollEl: null,
    startScrollTop: 0,
    rafId: null,
    handle,
  };

  dragState = state;
  draggingIndex.value = index;

  const draggedEl = rowEls.get(index);

  if (draggedEl) {
    draggedEl.style.transition = 'none';
  }

  document.body.style.userSelect = 'none';

  handle.setPointerCapture(event.pointerId);

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragEnd);

  const ionContent = handle.closest('ion-content');

  const getScrollElement = (
      ionContent as unknown as {
        getScrollElement?: () => Promise<HTMLElement>;
      } | null
  )?.getScrollElement?.bind(ionContent);

  if (getScrollElement) {
    void getScrollElement().then(el => {
      if (dragState === state) {
        dragState.scrollEl = el;
        dragState.startScrollTop = el.scrollTop;
      }
    });
  }
}

function currentScrollDelta(state: DragState): number {
  return state.scrollEl
      ? state.scrollEl.scrollTop - state.startScrollTop
      : 0;
}

function updateDragVisuals(): void {
  const state = dragState;

  if (!state) {
    return;
  }

  const count = props.items.length;
  const delta = currentScrollDelta(state);
  const pointerY = state.lastClientY;
  const draggedHeight = state.rowHeights[state.startIndex];

  // Позиция переноса: сколько «чужих» строк оказалось выше указателя.
  let target = 0;

  for (let i = 0; i < count; i++) {
    if (i === state.startIndex) {
      continue;
    }

    const middle = state.rowTops[i] + state.rowHeights[i] / 2 - delta;

    if (middle >= pointerY) {
      break;
    }

    target++;
  }

  target = Math.max(0, Math.min(target, count - 1));
  state.targetIndex = target;

  const draggedEl = rowEls.get(state.startIndex);

  if (draggedEl) {
    const followY =
        pointerY
        - delta
        - state.rowTops[state.startIndex]
        - draggedHeight / 2;

    draggedEl.style.transform = `translateY(${followY}px)`;
  }

  // Соседние строки сдвигаем, открывая место вставки.
  for (let i = 0; i < count; i++) {
    if (i === state.startIndex) {
      continue;
    }

    const el = rowEls.get(i);

    if (!el) {
      continue;
    }

    let shift = 0;

    if (
        target > state.startIndex
        && i > state.startIndex
        && i <= target
    ) {
      shift = -draggedHeight;
    } else if (
        target < state.startIndex
        && i >= target
        && i < state.startIndex
    ) {
      shift = draggedHeight;
    }

    el.style.transform = shift === 0 ? '' : `translateY(${shift}px)`;
  }
}

function ensureAutoScroll(): void {
  const state = dragState;

  if (!state || state.rafId !== null) {
    return;
  }

  const step = () => {
    const current = dragState;

    if (!current) {
      return;
    }

    const scrollEl = current.scrollEl;

    if (scrollEl) {
      const rect = scrollEl.getBoundingClientRect();
      const edge = 72;
      const maxStep = 18;
      let scrollStep = 0;

      if (current.lastClientY < rect.top + edge) {
        scrollStep = -Math.min(
            maxStep,
            Math.ceil((rect.top + edge - current.lastClientY) / 4),
        );
      } else if (current.lastClientY > rect.bottom - edge) {
        scrollStep = Math.min(
            maxStep,
            Math.ceil((current.lastClientY - (rect.bottom - edge)) / 4),
        );
      }

      if (scrollStep !== 0) {
        scrollEl.scrollTop += scrollStep;
        updateDragVisuals();
      }
    }

    current.rafId = requestAnimationFrame(step);
  };

  state.rafId = requestAnimationFrame(step);
}

function onDragMove(event: PointerEvent): void {
  const state = dragState;

  if (!state || event.pointerId !== state.pointerId) {
    return;
  }

  state.lastClientY = event.clientY;

  updateDragVisuals();
  ensureAutoScroll();
}

function onDragEnd(event: PointerEvent): void {
  const state = dragState;

  if (!state || event.pointerId !== state.pointerId) {
    return;
  }

  const {startIndex, targetIndex} = state;

  cleanupDrag();

  if (targetIndex !== startIndex) {
    emit('reorder', startIndex, targetIndex);
  }

  // Страховка после перерисовки списка: если на строке остался
  // inline-transform (например, отменённый жест), убираем его.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const el of rowEls.values()) {
        el.style.transform = '';
        el.style.transition = '';
      }
    });
  });
}

function cleanupDrag(): void {
  const state = dragState;

  if (!state) {
    return;
  }

  if (state.rafId !== null) {
    cancelAnimationFrame(state.rafId);
  }

  try {
    state.handle?.releasePointerCapture(state.pointerId);
  } catch {
    // Указатель уже отпущен браузером.
  }

  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragEnd);

  for (const el of rowEls.values()) {
    el.style.transform = '';
  }

  const draggedEl = rowEls.get(state.startIndex);

  if (draggedEl) {
    draggedEl.style.transition = '';
  }

  document.body.style.userSelect = '';

  dragState = null;
  draggingIndex.value = null;
}

onBeforeUnmount(cleanupDrag);

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
  /** Страница списка для отрисовки (показываем частями). */
  items: Track[];
  /** Полный список: очередь плеера формируем по нему целиком. */
  queueTracks: Track[];
  hasMore: boolean;
  loadMore: () => Promise<void>;
  loading: boolean;
  error: string | null;
  retry: () => void | Promise<void>;
}>();

let lastSyncedQueueKey = '';

watch(
    () => props.queueTracks,
    (queueTracks) => {
      if (
          !player.isServerSyncEnabled ||
          queueTracks.length === 0
      ) {
        return;
      }

      // Очередь обновляем, только если состав или порядок
      // реально изменились — иначе каждая перезапись списка
      // (кеш → сервер) дублировала бы синхронизацию.
      const queueKey = queueTracks
          .map(track => String(track.id))
          .join(',');

      if (queueKey === lastSyncedQueueKey) {
        return;
      }

      lastSyncedQueueKey = queueKey;

      player.setQueue([...queueTracks], sourceList);

      console.log('[Favorites] Очередь синхронизирована:', {
        count: queueTracks.length,
        ids: queueTracks.map(track => track.id),
      });
    },
    { immediate: true },
);

// Медиаклавиши/пульт переключили трек: переносим фокус на
// играющую строку. Иначе фиолетовый обвод фокуса остаётся
// на прежнем треке, и «выделенные границы» расходятся
// с эквалайзером. Поля ввода и другие контролы не трогаем.
watch(
    () => player.currentTrack?.id,
    (trackId) => {
      if (trackId === undefined || trackId === null) return;

      const active = document.activeElement;

      const focusFree =
          !active ||
          active === document.body ||
          (
              active instanceof HTMLElement &&
              active.closest('.track-list') !== null
          );

      if (!focusFree) return;

      const index = props.items.findIndex(
          (item) => Number(item.id) === Number(trackId),
      );

      const row = index === -1 ? null : rowEls.get(index) ?? null;

      // Строка скрыта (страница в фоне у Ionic) — не трогаем.
      if (!(row instanceof HTMLElement) || row.offsetParent === null) {
        return;
      }

      focusRow(row);
    },
);
</script>
<style scoped>
.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 26px;
  height: 42px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #6f7285;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle ion-icon {
  font-size: 19px;
  pointer-events: none;
}

.track-row.is-dragging {
  z-index: 100;
  border-color: #514078;
  background: #1d1930;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  opacity: 0.98;
  transition: none;
}

.track-row {
  width: auto;
  margin: 5px 10px;
}

.source-badge {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  width: fit-content;
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