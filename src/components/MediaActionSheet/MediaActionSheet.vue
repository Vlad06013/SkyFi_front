<template>
  <Teleport to="body">
    <div v-if="sheet" class="sheet-mask media-sheet-mask" @click.self="close" @pointerdown.stop>
      <div class="sheet" :class="{ 'is-dragging': dragging }" :style="dragStyle">
        <div class="sheet-head" @pointerdown="onDragStart">
          <div class="handle" />
          <div class="sheet-title">{{ title }}</div>
        </div>

        <div v-if="sheet !== 'devices'" class="now-card" style="margin-bottom:8px">
          <div class="thumb" :style="{ background: coverVar(entity.source) }">
            <SourceBadge :source="entity.source" />
          </div>
          <div class="track-meta">
            <div class="track-title">{{ entity.title }}</div>
            <div class="track-artist">{{ entity.artist }}</div>
          </div>
        </div>

        <template v-if="sheet === 'friend-queue' || sheet === 'friend-share'">
          <div class="field" :class="{ 'is-focus': friendFocus }" style="margin-bottom:10px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" />
            </svg>
            <input
              v-model="friendQuery"
              placeholder="email"
              @focus="friendFocus = true"
              @blur="friendFocus = false"
            >
          </div>
          <button
            v-for="friend in visibleFriends"
            :key="friend.id"
            class="friend-row"
            type="button"
            @click="sheet === 'friend-share' ? pickShare(friend.name) : pickQueue(friend.name)"
          >
            <div class="avatar ini" :class="friend.tone">{{ friend.initial }}</div>
            <div class="track-meta">
              <div class="track-title">{{ friend.name }}</div>
              <div class="idle">{{ friend.email }}</div>
            </div>
            <svg
              v-if="sheet === 'friend-queue'"
              class="friend-act"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h11M3 12h11M3 18h6.5" />
              <path d="M13.6 7 22 12l-8.4 5z" fill="currentColor" stroke="none" />
            </svg>
            <svg
              v-else
              class="friend-act"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M8 9.5H6.5A2.5 2.5 0 0 0 4 12v7.5A2.5 2.5 0 0 0 6.5 22h11a2.5 2.5 0 0 0 2.5-2.5V12a2.5 2.5 0 0 0-2.5-2.5H16" />
              <path d="M12 15.5V3m0 0 3.6 3.6M12 3 8.4 6.6" />
            </svg>
          </button>
        </template>

        <template v-else-if="sheet === 'playlist'">
          <MediaRow
            v-for="playlist in favoritePlaylists"
            :key="playlist.source_id"
            :title="playlist.title"
            :subtitle="`${playlist.item_count} треков`"
            :source="playlist.source_type"
            :menuable="false"
            @open="pickPlaylist(playlist.title)"
          />
        </template>

        <template v-else-if="sheet === 'share'">
          <div class="copied">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 9.5 17 19 7.5" /></svg>
            Ссылка уже в буфере
          </div>
          <button class="friend-row" type="button" style="padding:8px 4px" @click="openInAppShare">
            <div class="avatar ini">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4.2 10.6a8.4 8.4 0 0 1 15.6 0" />
                <path d="M9 12.4v8.1l7.7-4.05z" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div class="track-meta">
              <div class="track-title">Другу в SkyFi</div>
              <div class="idle">поиск по email</div>
            </div>
          </button>
        </template>

        <template v-else-if="sheet === 'devices'">
          <div class="select-menu">
            <button
              v-for="device in state.devices"
              :key="device.id"
              class="select-opt"
              :class="{ 'is-on': device.id === state.active_device_id }"
              type="button"
              @click="pickDevice(device.id)"
            >
              <span>
                {{ device.name }}
                <span v-if="deviceCaption(device)" class="osub">{{ deviceCaption(device) }}</span>
              </span>
              <svg
                v-if="device.id === state.active_device_id"
                class="tick"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M5 12.5 9.5 17 19 7.5" />
              </svg>
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import MediaRow from '@/components/MediaRow/MediaRow.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { coverVar } from '@/lib/cover';
import { trackPointer } from '@/lib/pointer-drag';
import { favoritePlaylists } from '@/mocks/catalog';
import { mockFriends } from '@/mocks/friends';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type { MediaSheet, MenuEntity } from '@/lib/media-menu';
import type { PlayerDevice } from '@/types';

const props = defineProps<{
  sheet: MediaSheet;
  entity: MenuEntity;
}>();

const emit = defineEmits<{
  close: [];
  'update:sheet': [MediaSheet];
}>();

const player = usePlayerStore();
const { state, localDeviceId } = storeToRefs(player);
const toast = useToastStore();
const friendQuery = ref('');
const friendFocus = ref(false);
const dragging = ref(false);
const dragY = ref(0);

const title = computed(() => {
  if (props.sheet === 'friend-queue') return 'В очередь другу';
  if (props.sheet === 'friend-share') return 'Другу в SkyFi';
  if (props.sheet === 'playlist') return 'В плейлист';
  if (props.sheet === 'share') return 'Поделиться';
  if (props.sheet === 'devices') return 'Устройства';
  return '';
});

const visibleFriends = computed(() => {
  const q = friendQuery.value.trim().toLowerCase();
  if (!q) return mockFriends;
  return mockFriends.filter(
    (friend) => friend.name.toLowerCase().includes(q) || friend.email.toLowerCase().includes(q),
  );
});

const dragStyle = computed(() => {
  if (!dragY.value) return undefined;
  return { transform: `translateY(${dragY.value}px)` };
});

watch(
  () => props.sheet,
  (next) => {
    if (next === 'share') {
      void navigator.clipboard?.writeText(`https://skyfi.app/t/${props.entity.sourceId}`).catch(() => undefined);
    }
    if (next === 'friend-queue' || next === 'friend-share') friendQuery.value = '';
  },
);

function close() {
  emit('update:sheet', null);
  emit('close');
}

function pickQueue(name: string) {
  toast.show(`${props.entity.title} — ${name} в очередь`, 'отправили другу');
  close();
}

function pickShare(name: string) {
  toast.show(`${props.entity.title} — ${props.entity.artist}`, `поделились с ${name}`);
  close();
}

function pickPlaylist(name: string) {
  toast.show(`${props.entity.title} — ${props.entity.artist}`, `добавлено в «${name}»`);
  close();
}

function openInAppShare() {
  emit('update:sheet', 'friend-share');
}

function deviceCaption(device: PlayerDevice) {
  if (device.id === localDeviceId.value) return 'это устройство';
  if (device.id === state.value.active_device_id) return '';
  return 'не активен';
}

function pickDevice(id: number) {
  player.activateDevice(id);
  const name = state.value.devices.find((device) => device.id === id)?.name ?? '';
  toast.show(name, 'играет здесь');
  close();
}

function onDragStart(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.stopPropagation();
  const startY = event.clientY;
  dragging.value = true;
  dragY.value = 0;
  trackPointer(event, {
    move: (next) => {
      dragY.value = Math.max(0, next.clientY - startY);
    },
    up: () => {
      const shouldClose = dragY.value > 88;
      dragging.value = false;
      if (shouldClose) {
        dragY.value = 0;
        close();
        return;
      }
      dragY.value = 0;
    },
  });
}
</script>

<style scoped>
.media-sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-end;
  padding: 8px;
}

.media-sheet-mask .sheet {
  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  max-height: min(72vh, 560px);
  overflow: auto;
  overscroll-behavior: none;
  transition: transform 0.2s ease;
}

.sheet.is-dragging {
  overflow: hidden;
  transition: none;
}

.sheet-head {
  touch-action: none;
  cursor: grab;
}

.friend-row,
.pl-row,
.select-opt {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.friend-act {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--color-text-faint);
}

.select-opt:hover {
  background: var(--color-surface-3);
}

.select-opt.is-on {
  color: var(--color-accent);
  font-weight: 600;
}

.select-opt:focus {
  outline: none;
}

.select-opt:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-accent);
}
</style>
