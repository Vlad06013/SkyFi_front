<template>
  <div
    :class="[rootClass, { 'is-playing': isPlayable && playing, 'is-drag': dragging, offline }]"
    :style="dragStyle"
    role="button"
    tabindex="0"
    @click="emit('open')"
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

    <div v-if="kind === 'video'" class="vid-thumb" :style="{ background: coverVar(source) }">
      <img v-if="cover" :src="cover" alt="">
      <SourceBadge :source="source" />
      <span class="vid-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M10.2 9.6v4.8l4.2-2.4z" fill="currentColor" stroke="none" />
        </svg>
      </span>
    </div>
    <div v-else-if="kind === 'media'" class="cover" :class="{ round }" :style="{ background: coverVar(source) }">
      <img v-if="cover" :src="cover" alt="">
      <SourceBadge :source="source" />
    </div>
    <div v-else class="thumb" :style="{ background: coverVar(source) }">
      <img v-if="cover" :src="cover" alt="">
      <SourceBadge :source="source" />
    </div>

    <div class="track-meta">
      <div class="track-title">{{ title }}</div>
      <div class="track-artist">{{ subtitle }}</div>
    </div>

    <span v-if="isPlayable && playing" class="eq" aria-hidden="true"><i /><i /><i /></span>
    <svg
      v-if="liked"
      class="like-mark"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-label="в избранном"
    >
      <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
    </svg>
    <svg
      v-if="downloaded"
      class="dl-mark"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-label="скачан"
    >
      <path d="M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5" />
      <path d="M5 17h14" />
    </svg>

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

<script src="./SnapshotRow.ts" lang="ts"></script>
