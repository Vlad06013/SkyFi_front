
<template>
  <div class="track-menu-wrap" @click.stop @pointerdown.stop>
    <button
        type="button"
        class="track-menu-trigger"
        ref="trigger"
        :aria-label="`Действия для трека ${track.title}`"
        :aria-expanded="isOpen"
        @click.stop="toggleMenu"
    >
      <ion-spinner
          v-if="loading"
          name="crescent"
      />
      <ion-icon
          v-else
          :icon="ellipsisVerticalOutline"
      />
    </button>

    <Teleport to="body">
      <div
          v-if="isOpen && isMobile"
          class="track-menu-backdrop"
          @click="closeMenu"
      >
        <section
            class="track-context-sheet"
            role="dialog"
            aria-modal="true"
            :aria-label="`Действия для трека ${track.title}`"
            @click.stop
            @pointerdown.stop
        >
          <div class="track-sheet-handle"></div>

          <div class="track-sheet-heading">
            <div class="track-sheet-cover">
              <ion-icon :icon="musicalNotesOutline" />
            </div>

            <div class="track-sheet-info">
              <strong>{{ track.title }}</strong>
              <span>
                {{
                  track.artists?.map(artist => artist.name).join(', ')
                  || 'Неизвестный исполнитель'
                }}
              </span>
            </div>

            <button
                type="button"
                class="track-sheet-close"
                aria-label="Закрыть меню"
                @click="closeMenu"
            >
              <ion-icon :icon="closeOutline" />
            </button>
          </div>

          <div class="track-context-menu track-context-menu-mobile" role="menu">
            <button
                type="button"
                role="menuitem"
                :disabled="loading"
                @click="runAction('next')"
            >
              <ion-icon :icon="playSkipForwardOutline" />
              Играть следующим
            </button>

            <button
                type="button"
                role="menuitem"
                :disabled="loading"
                @click="runAction('queue')"
            >
              <ion-icon :icon="listOutline" />
              Добавить в очередь
            </button>

            <button
                type="button"
                role="menuitem"
                :disabled="loading"
                @click="runAction('favorite')"
            >
              <ion-icon :icon="heartOutline" />
              {{ isFavorite ? 'Удалить из избранного' : 'Добавить в избранное' }}
            </button>

            <AddToPlaylistItem
                :track-id="Number(track.id)"
                @close="closeMenu"
            />

            <DownloadTrackItem
                :track-id="Number(track.id)"
                @close="closeMenu"
            />
          </div>
        </section>
      </div>

      <div
          v-else-if="isOpen"
          ref="desktopMenu"
          class="track-context-menu track-context-menu-desktop"
          :class="{ 'opens-up': opensUp }"
          :style="desktopMenuStyle"
          role="menu"
          @click.stop
          @pointerdown.stop
      >
        <button
            type="button"
            role="menuitem"
            :disabled="loading"
            @click="runAction('next')"
        >
          <ion-icon :icon="playSkipForwardOutline" />
          Играть следующим
        </button>

        <button
            type="button"
            role="menuitem"
            :disabled="loading"
            @click="runAction('queue')"
        >
          <ion-icon :icon="listOutline" />
          Добавить в очередь
        </button>

        <button
            type="button"
            role="menuitem"
            :disabled="loading"
            @click="runAction('favorite')"
        >
          <ion-icon :icon="heartOutline" />
          {{ isFavorite ? 'Удалить из избранного' : 'Добавить в избранное' }}
        </button>

        <AddToPlaylistItem
            :track-id="Number(track.id)"
            @close="closeMenu"
        />

        <DownloadTrackItem
            :track-id="Number(track.id)"
            @close="closeMenu"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { IonIcon, IonSpinner } from '@ionic/vue';
import {
  closeOutline,
  ellipsisVerticalOutline,
  heartOutline,
  listOutline,
  musicalNotesOutline,
  playSkipForwardOutline,
} from 'ionicons/icons';

import AddToPlaylistItem from '@/components/track-menu/AddToPlaylistItem.vue';
import DownloadTrackItem from '@/components/track-menu/DownloadTrackItem.vue';
import type { TrackMenuItem } from '@/types/TrackMenuItem';
const props = defineProps<{
  track: TrackMenuItem;
  isFavorite: boolean;
  loading?: boolean;
}>();

const emit = defineEmits<{
  action: [track: TrackMenuItem, action: 'next' | 'queue' | 'favorite'];
  open: [track: TrackMenuItem];
  close: [track: TrackMenuItem];
}>();

const isOpen = ref(false);
const isMobile = ref(false);
const opensUp = ref(false);
const desktopMenu = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);

const desktopMenuStyle = ref<Record<string, string>>({
  visibility: 'hidden',
});

let mediaQuery: MediaQueryList | null = null;

function updateViewportMode() {
  isMobile.value = mediaQuery?.matches ?? window.innerWidth <= 650;
}

async function positionDesktopMenu() {
  await nextTick();

  const menu = desktopMenu.value;
  const button = trigger.value;

  if (!menu || !button || isMobile.value) return;

  const rect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const menuHeight = menuRect.height || 280;
  const menuWidth = menuRect.width || 260;
  const margin = 12;
  const gap = 6;

  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  opensUp.value =
      spaceBelow < menuHeight + gap + margin &&
      spaceAbove > spaceBelow;

  const top = opensUp.value
      ? Math.max(margin, rect.top - menuHeight - gap)
      : Math.min(
          window.innerHeight - menuHeight - margin,
          rect.bottom + gap,
      );

  const left = Math.max(
      margin,
      Math.min(
          rect.right - menuWidth,
          window.innerWidth - menuWidth - margin,
      ),
  );

  desktopMenuStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    right: 'auto',
    bottom: 'auto',
    visibility: 'visible',
  };
}

function toggleMenu() {
  if (isOpen.value) {
    closeMenu();
    return;
  }

  trigger.value = document.activeElement instanceof HTMLButtonElement
      ? document.activeElement
      : null;

  isOpen.value = true;
  emit('open', props.track);

  if (!isMobile.value) {
    void positionDesktopMenu();
  }
}

function closeMenu() {
  if (!isOpen.value) return;

  isOpen.value = false;
  desktopMenuStyle.value = { visibility: 'hidden' };
  emit('close', props.track);
}

function runAction(action: 'next' | 'queue' | 'favorite') {
  emit('action', props.track, action);
  closeMenu();
}

function handleOutsidePointer(event: PointerEvent) {
  const target = event.target;

  if (!(target instanceof Element)) return;

  if (
      !target.closest('.track-menu-wrap') &&
      !target.closest('.track-context-menu') &&
      !target.closest('.track-context-sheet')
  ) {
    closeMenu();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu();
}

function handleViewportChange() {
  updateViewportMode();

  if (isOpen.value && !isMobile.value) {
    void positionDesktopMenu();
  }
}

watch(isOpen, open => {
  if (!open) return;

  document.addEventListener('pointerdown', handleOutsidePointer);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);
});

watch(isOpen, open => {
  if (open) return;

  document.removeEventListener('pointerdown', handleOutsidePointer);
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', handleViewportChange, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointer);
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', handleViewportChange, true);
  mediaQuery?.removeEventListener('change', updateViewportMode);
});

if (typeof window !== 'undefined') {
  mediaQuery = window.matchMedia('(max-width: 650px)');
  updateViewportMode();
  mediaQuery.addEventListener('change', updateViewportMode);
}
</script>

<style>
.track-menu-wrap {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
}

.track-menu-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #9296a7;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.track-menu-trigger:hover,
.track-menu-trigger:focus-visible {
  background: #292d3b;
  color: #f5f7fa;
}

.track-menu-trigger ion-icon {
  font-size: 21px;
}

.track-context-menu {
  z-index: 10000;
  width: 260px;
  box-sizing: border-box;
  padding: 6px;
  border: 1px solid #303444;
  border-radius: 14px;
  background: #171a23;
  color: #f5f7fa;
  box-shadow: 0 14px 45px #0008;
}

.track-context-menu-desktop {
  position: fixed;
}

.track-context-menu button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 43px;
  padding: 11px 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #e6e7ee;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.track-context-menu button:hover:not(:disabled) {
  background: #292d3b;
}

.track-context-menu button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.track-context-menu button ion-icon {
  flex-shrink: 0;
  font-size: 18px;
  color: #c4b5fd;
}

.track-menu-backdrop {
  position: fixed;
  z-index: 20000;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: #0009;
  animation: track-sheet-backdrop-in 0.2s ease;
  overscroll-behavior: contain;
}

.track-context-sheet {
  width: 100%;
  max-height: min(88dvh, 760px);
  box-sizing: border-box;
  padding: 10px 18px calc(22px + env(safe-area-inset-bottom));
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid #303444;
  border-bottom: 0;
  border-radius: 22px 22px 0 0;
  background: #11141c;
  box-shadow: 0 -12px 40px #0005;
  animation: track-sheet-in 0.25s ease;
}

.track-sheet-handle {
  width: 38px;
  height: 4px;
  margin: 0 auto 18px;
  border-radius: 4px;
  background: #55596a;
}

.track-sheet-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid #292d3b;
}

.track-sheet-cover {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: linear-gradient(145deg, #8b5cf6, #292d3b);
  color: white;
  font-size: 23px;
}

.track-sheet-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.track-sheet-info strong,
.track-sheet-info span {
  overflow-wrap: anywhere;
}

.track-sheet-info strong {
  color: #f5f7fa;
  font-size: 14px;
}

.track-sheet-info span {
  color: #9296a7;
  font-size: 12px;
}

.track-sheet-close {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 50%;
  background: #292d3b;
  color: #f5f7fa;
  font-size: 20px;
}

.track-context-menu-mobile {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.track-context-menu-mobile button {
  min-height: 50px;
  font-size: 14px;
}

@keyframes track-sheet-in {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

@keyframes track-sheet-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .track-menu-backdrop,
  .track-context-sheet {
    animation: none;
  }
}
</style>
