<template>
  <div
    class="seek-bar"
    role="slider"
    :aria-valuemin="0"
    :aria-valuemax="100"
    :aria-valuenow="Math.round(modelValue)"
    :aria-label="label"
    @pointerdown="onPointerDown"
  >
    <div class="progress">
      <div class="fill" :style="{ width: modelValue + '%' }" />
      <div class="knob" :style="{ left: modelValue + '%' }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ratioFromClientX, trackPointer } from '@/lib/pointer-drag';

const props = defineProps<{
  modelValue: number;
  label: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

function setFromEvent(event: PointerEvent, el: HTMLElement) {
  emit('update:modelValue', ratioFromClientX(event.clientX, el) * 100);
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.stopPropagation();
  const el = event.currentTarget as HTMLElement;
  setFromEvent(event, el);
  trackPointer(event, {
    move: (next) => setFromEvent(next, el),
    up: () => undefined,
  });
}
</script>

<style scoped>
.seek-bar {
  padding: 12px 0;
  cursor: pointer;
  touch-action: none;
}

.progress {
  max-width: none;
  pointer-events: none;
}
</style>
