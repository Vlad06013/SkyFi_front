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

<script src="./ContextMenu.ts" lang="ts"></script>

<style scoped src="./ContextMenu.css"></style>
