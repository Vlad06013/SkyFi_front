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

<script src="./SeekBar.ts" lang="ts"></script>

<style scoped src="./SeekBar.css"></style>
