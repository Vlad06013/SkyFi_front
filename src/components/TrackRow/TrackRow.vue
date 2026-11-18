<template>
  <div
    class="track-row"
    :class="{ 'is-playing': playing, 'is-drag': dragging, offline }"
    :style="dragStyle"
    role="button"
    tabindex="0"
    @click="onPlay"
  >
    <button
      v-if="sortable"
      class="grip"
      type="button"
      tabindex="-1"
      aria-label="перетащить"
      @click.stop
      @pointerdown.stop="emit('sort', $event)"
    ><i /><i /><i /></button>
    <div class="thumb" :style="{ background: coverVar(source) }">
      <SourceBadge :source="source" />
    </div>
    <div class="track-meta">
      <div class="track-title">{{ title }}</div>
      <div class="track-artist">{{ artist }}</div>
    </div>
    <span v-if="playing" class="eq" aria-hidden="true"><i /><i /><i /></span>
    <svg
      v-if="liked"
      class="like-mark"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-label="в избранном"
    >
      <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
    </svg>
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

<script src="./TrackRow.ts" lang="ts"></script>
