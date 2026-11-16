<template>
  <Teleport to="body">
    <div v-if="open" class="ctx-layer">
      <div class="ctx-scrim" @pointerdown="close" />
      <div class="ctx ctx-pop" :style="popStyle" @click.stop>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps<{
  open: boolean;
  top: number;
  right: number;
}>();

const emit = defineEmits<{ close: [] }>();

const popStyle = computed(() => ({
  top: `${props.top}px`,
  right: `${props.right}px`,
}));

function close() {
  emit('close');
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
.ctx-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
  pointer-events: none;
}

.ctx-scrim {
  position: absolute;
  inset: 0;
  pointer-events: auto;
}

.ctx-pop {
  position: absolute;
  margin: 0;
  pointer-events: auto;
  width: min(280px, calc(100vw - 24px));
}
</style>
