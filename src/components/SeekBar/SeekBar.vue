<template>
  <div
    class="seek-bar"
    role="slider"
    :tabindex="tabIndex"
    :aria-valuemin="0"
    :aria-valuemax="100"
    :aria-valuenow="Math.round(modelValue)"
    :aria-label="label"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
    @keydown="onKeydown"
  >
    <div class="progress">
      <div class="buffer" aria-hidden="true">
        <div
          v-for="(range, index) in buffered"
          :key="index"
          class="seg"
          :style="{ left: range.start * 100 + '%', width: (range.end - range.start) * 100 + '%' }"
        />
      </div>
      <div class="fill" :style="{ width: modelValue + '%' }" />
      <div class="knob" :style="{ left: modelValue + '%' }" />
    </div>
  </div>
</template>

<script src="./SeekBar.ts" lang="ts"></script>

<style scoped src="./SeekBar.css"></style>
