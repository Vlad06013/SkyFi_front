<template>
  <div class="pl-row" role="button" tabindex="0" @click="emit('open')">
    <div class="cover" :class="{ round }" :style="{ background: coverVar(source) }">
      <SourceBadge :source="source" />
    </div>
    <div class="track-meta">
      <div class="track-title">{{ title }}</div>
      <div class="track-artist">{{ subtitle }}</div>
    </div>
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
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import { coverVar } from '@/lib/cover';
import type { SnapshotSource } from '@/types';

withDefaults(defineProps<{
  title: string;
  subtitle: string;
  source: SnapshotSource;
  round?: boolean;
  menuable?: boolean;
}>(), {
  round: false,
  menuable: true,
});

const emit = defineEmits<{
  open: [];
  menu: [event: MouseEvent];
}>();
</script>
