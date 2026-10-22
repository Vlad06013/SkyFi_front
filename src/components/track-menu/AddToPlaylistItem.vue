<template>
  <div class="add-to-playlist" @click.stop @pointerdown.stop>
    <button
        type="button"
        role="menuitem"
        class="menu-item"
        :disabled="!validTrackId || panelLoading"
        @click="togglePanel"
    >
      <ion-icon :icon="listOutline" />

      <span class="item-label">Добавить в плейлист</span>

      <ion-icon
          class="chevron"
          :icon="panelOpen ? chevronDownOutline : chevronForwardOutline"
      />
    </button>

    <div v-if="panelOpen" class="playlist-panel">
      <p v-if="panelLoading" class="panel-status">
        <ion-spinner name="crescent" />
        Загружаем плейлисты...
      </p>

      <div
          v-else-if="panelError"
          class="panel-status panel-error"
      >
        <span>{{ panelError }}</span>

        <button
            type="button"
            class="panel-retry"
            @click.stop="loadPlaylists"
        >
          Повторить
        </button>
      </div>

      <template v-else>
        <p v-if="!playlists.length" class="panel-status">
          У тебя пока нет плейлистов.
          Создай их на странице «Плейлисты».
        </p>

        <button
            v-for="playlist in playlists"
            :key="playlist.id"
            type="button"
            class="menu-item playlist-option"
            :disabled="addingToId !== null"
            @click.stop="addTo(playlist)"
        >
          <span
              class="playlist-color-dot"
              :style="{ background: getPlaylistColor(playlist.id) }"
          />

          <span class="playlist-name">{{ playlist.name }}</span>

          <ion-spinner
              v-if="addingToId === Number(playlist.id)"
              name="crescent"
          />

          <ion-icon
              v-else-if="addedToId === Number(playlist.id)"
              :icon="checkmarkOutline"
              class="added-icon"
          />
        </button>

        <p v-if="addError" class="panel-status panel-error">
          {{ addError }}
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { IonIcon, IonSpinner } from '@ionic/vue';
import {
    checkmarkOutline,
    chevronDownOutline,
    chevronForwardOutline,
    listOutline,
} from 'ionicons/icons';
import axios from 'axios';

import {
    addTrackToPlaylist,
    getPlaylistsCached,
    type Playlist,
} from '@/api/playlists';

const props = defineProps<{
    trackId: number;
}>();

const emit = defineEmits<{
    (event: 'close'): void;
}>();

const validTrackId = computed(
    () => Number.isFinite(props.trackId) && props.trackId > 0,
);

const panelOpen = ref(false);
const panelLoading = ref(false);
const panelError = ref('');
const addError = ref('');

const playlists = ref<Playlist[]>([]);

const addingToId = ref<number | null>(null);
const addedToId = ref<number | null>(null);

let closeTimer: ReturnType<typeof setTimeout> | null = null;

function togglePanel(): void {
    panelOpen.value = !panelOpen.value;
    addError.value = '';

    if (
        panelOpen.value &&
        playlists.value.length === 0 &&
        !panelLoading.value &&
        !panelError.value
    ) {
        void loadPlaylists();
    }
}

async function loadPlaylists(): Promise<void> {
    panelLoading.value = true;
    panelError.value = '';

    try {
        playlists.value = await getPlaylistsCached();
    } catch (err: unknown) {
        console.error(
            '[AddToPlaylist] Ошибка загрузки плейлистов:',
            err,
        );

        panelError.value = axios.isAxiosError(err) && !err.response
            ? 'Не удалось подключиться к серверу.'
            : 'Не удалось загрузить плейлисты.';
    } finally {
        panelLoading.value = false;
    }
}

async function addTo(playlist: Playlist): Promise<void> {
    if (addingToId.value !== null || !validTrackId.value) {
        return;
    }

    const playlistId = Number(playlist.id);

    addingToId.value = playlistId;
    addError.value = '';

    try {
        await addTrackToPlaylist(playlistId, props.trackId);

        scheduleClose(playlistId);
    } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.status === 409) {
            // Трек уже есть в плейлисте — считаем операцию выполненной.
            scheduleClose(playlistId);
        } else {
            console.error(
                '[AddToPlaylist] Ошибка добавления трека:',
                err,
            );

            addError.value = 'Не удалось добавить трек. Попробуй ещё раз.';
        }
    } finally {
        addingToId.value = null;
    }
}

function scheduleClose(playlistId: number): void {
    addedToId.value = playlistId;

    if (closeTimer) {
        clearTimeout(closeTimer);
    }

    closeTimer = setTimeout(() => {
        emit('close');
    }, 900);
}

onBeforeUnmount(() => {
    if (closeTimer) {
        clearTimeout(closeTimer);
    }
});

// ============================================
// ОФОРМЛЕНИЕ
// ============================================

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

function getPlaylistColor(id: number): string {
    const normalizedId = Number(id);

    if (!Number.isFinite(normalizedId)) {
        return coverColors[0];
    }

    const index = Math.abs(normalizedId) % coverColors.length;

    return coverColors[index];
}
</script>

<style scoped>
.add-to-playlist {
    width: 100%;
}

.menu-item {
    display: flex;
    align-items: center;
    gap: 11px;

    width: 100%;
    min-height: 42px;
    padding: 10px 12px;

    border: 0;
    border-radius: 9px;

    background: transparent;
    color: var(--ion-text-color, #f5f7fa);

    font: inherit;
    font-size: 14px;
    text-align: left;

    cursor: pointer;
}

.menu-item:hover:not(:disabled),
.menu-item:focus-visible {
    background: var(--ion-color-step-100, rgba(128, 128, 128, 0.12));
    outline: none;
}

.menu-item:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.menu-item ion-icon {
    flex: 0 0 auto;

    font-size: 18px;
    color: var(--ion-color-medium, #888);
}

.item-label {
    flex: 1;
    min-width: 0;
}

.chevron {
    margin-left: auto;
}

.playlist-panel {
    margin: 2px 4px 4px;
    padding: 6px 0 2px;

    border-top: 1px solid var(--ion-color-step-150, rgba(128, 128, 128, 0.2));

    max-height: 230px;
    overflow-y: auto;
}

.playlist-option {
    min-height: 38px;
    padding: 8px 12px;

    font-size: 13px;
}

.playlist-color-dot {
    flex: 0 0 auto;

    width: 12px;
    height: 12px;

    border-radius: 4px;
}

.playlist-name {
    flex: 1;
    min-width: 0;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.added-icon {
    color: #7ee2a8 !important;
}

.panel-status {
    display: flex;
    align-items: center;
    gap: 8px;

    margin: 4px 0;
    padding: 6px 12px;

    color: var(--ion-color-medium, #888);
    font-size: 12px;
}

.panel-error {
    color: #fda4af;
    flex-wrap: wrap;
}

.panel-retry {
    padding: 4px 10px;

    border: 1px solid #343849;
    border-radius: 8px;

    background: transparent;
    color: #f5f7fa;

    font: inherit;
    font-size: 11px;

    cursor: pointer;
}

.panel-retry:hover {
    border-color: #8b5cf6;
}
</style>
