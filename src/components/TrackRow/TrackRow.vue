<template>
  <div
    class="track-row"
    :class="{ 'is-playing': playing, 'is-drag': dragging, offline }"
    :style="dragStyle"
    role="button"
    tabindex="0"
    @click="onPlay"
  >
    <button
      v-if="sortable"
      class="grip"
      type="button"
      tabindex="-1"
      aria-label="перетащить"
      @click.stop
      @pointerdown.stop="emit('sort', $event)"
    ><i /><i /><i /></button>
    <div class="thumb" :style="{ background: coverVar(source) }">
      <SourceBadge :source="source" />
    </div>
    <div class="track-meta">
      <div class="track-title">{{ title }}</div>
      <div class="track-artist">{{ artist }}</div>
    </div>
    <span v-if="playing" class="eq" aria-hidden="true"><i /><i /><i /></span>
    <slot />
    <button
      v-if="menuable"
      class="icon-btn more"
      type="button"
      aria-label="ещё"
      @click.stop="emit('menu', $event)"
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="5.5" cy="12" r="1.55" /><circle cx="12" cy="12" r="1.55" /><circle cx="18.5" cy="12" r="1.55" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { consumeSortClick } from '@/lib/list-sort';
import { coverVar } from '@/lib/cover';
import type { SnapshotSource } from '@/types';

withDefaults(defineProps<{
  title: string;
  artist: string;
  source: SnapshotSource;
  playing?: boolean;
  offline?: boolean;
  sortable?: boolean;
  menuable?: boolean;
  dragging?: boolean;
  dragStyle?: CSSProperties;
}>(), {
  playing: false,
  offline: false,
  sortable: false,
  menuable: true,
  dragging: false,
});

const emit = defineEmits<{
  play: [];
  menu: [event: MouseEvent];
  sort: [event: PointerEvent];
}>();

function onPlay() {
  if (consumeSortClick()) return;
  emit('play');
}
</script>

<style scoped>
.grip {
  touch-action: none;
  border: 0;
  background: transparent;
  padding: 0;
}

.grip:focus {
  outline: none;
}
</style>
