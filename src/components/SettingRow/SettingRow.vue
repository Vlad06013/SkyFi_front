<template>
  <div
    class="set-row"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    @click="clickable ? emit('open') : undefined"
  >
    <div v-if="$slots.icon" class="ico" :class="{ on }">
      <slot name="icon" />
    </div>
    <div class="track-meta">
      <div class="track-title">{{ title }}</div>
      <div v-if="idle" class="idle">{{ idle }}</div>
    </div>
    <slot />
  </div>
</template>

<script src="./SettingRow.ts" lang="ts"></script>
