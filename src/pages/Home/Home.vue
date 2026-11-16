<template>
  <div class="wave-page">
    <div class="appbar">
      <button class="icon-btn ghost n-bell" type="button" aria-label="уведомления" @click.stop="toggleBell">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6.5 9.5a5.5 5.5 0 1 1 11 0c0 5.5 2.5 6.5 2.5 8H4c0-1.5 2.5-2.5 2.5-8z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        <i v-if="hasUnread" class="badge-dot" />
      </button>
    </div>
    <div class="wave-stage">
      <div class="wave-blobs" aria-hidden="true">
        <span class="wave-blob wave-blob-a" />
        <span class="wave-blob wave-blob-b" />
        <span class="wave-blob wave-blob-c" />
      </div>
      <div class="wave-disc" role="button" tabindex="0" aria-label="развернуть плеер" @click="openExpanded">
        <div class="wave-flame" :class="{ 'wave-flame-on': playing }" aria-hidden="true">
          <span class="wave-flame-ring" />
          <span class="wave-flame-tongue wave-flame-tongue-1" />
          <span class="wave-flame-tongue wave-flame-tongue-2" />
          <span class="wave-flame-tongue wave-flame-tongue-3" />
        </div>
        <div class="cover" :style="{ background: current ? coverVar(current.source_type) : 'var(--gradient-cover-1)' }">
          <SourceBadge v-if="current" :source="current.source_type" />
        </div>
      </div>
      <div class="wave-pill" role="button" tabindex="0" aria-label="развернуть плеер" @click="openExpanded">
        <span class="wave-pill-fill" style="width:38%" />
        <span class="wave-pill-text">{{ artist }} — {{ title }}</span>
        <button class="icon-btn" :class="{ liked }" type="button" aria-label="в избранном" @click.stop="toggleLike">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
          </svg>
        </button>
      </div>
      <div class="wave-controls">
        <button class="plain" type="button" aria-label="назад" @click="skipPrevious">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 6.5 10 12l8 5.5zM6 6.5h2.5v11H6z" /></svg>
        </button>
        <button class="fab" type="button" :aria-label="playing ? 'пауза' : 'играть'" @click="togglePlay">
          <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </button>
        <button class="plain" type="button" aria-label="вперёд" @click="skipNext">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6.5l8 5.5-8 5.5zM15.5 6.5H18v11h-2.5z" /></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { usePlayerStore } from '@/stores/player';
import { useNotificationsStore } from '@/stores/notifications';
import { coverVar } from '@/lib/cover';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';

const player = usePlayerStore();
const { current, title, artist, liked } = storeToRefs(player);
const playing = computed(() => player.state.is_playing);
const { togglePlay, toggleLike, openExpanded, skipNext, skipPrevious } = player;
const notifications = useNotificationsStore();
const { hasUnread } = storeToRefs(notifications);
const { toggle: toggleBell } = notifications;
</script>

<style scoped src="./Home.css"></style>
