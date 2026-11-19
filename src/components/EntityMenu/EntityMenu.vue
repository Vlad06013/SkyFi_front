<template>
  <ContextMenu :open="open" :top="top" :right="right" @close="emit('close')">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      :class="{ liked: item.liked, danger: item.danger }"
      @click="emit('action', item.id)"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        v-html="item.icon"
      />
      {{ item.label }}
    </button>
  </ContextMenu>
</template>

<script src="./EntityMenu.ts" lang="ts"></script>
