<template>
  <Teleport to="body">
    <div v-if="open" class="sheet-mask" @click.self="close">
      <div class="sheet app-sheet" :class="{ 'is-dragging': dragging }" :style="dragStyle">
        <div class="sheet-head" @pointerdown="onDragStart">
          <div class="handle" />
          <div v-if="title" class="sheet-title">{{ title }}</div>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script src="./AppSheet.ts" lang="ts"></script>

<style scoped src="./AppSheet.css"></style>
