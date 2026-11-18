<template>
  <div class="vid-row" role="button" tabindex="0" @click="emit('open')">
    <div class="vid-thumb" :style="{ background: coverVar(source) }">
      <img v-if="cover" :src="cover" alt="">
      <SourceBadge :source="source" />
      <span class="vid-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M10.2 9.6v4.8l4.2-2.4z" fill="currentColor" stroke="none" />
        </svg>
      </span>
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

<script src="./VideoRow.ts" lang="ts"></script>
