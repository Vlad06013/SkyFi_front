<template>
  <button
    v-if="current"
    class="mini-player"
    type="button"
    :style="dragStyle"
    @pointerdown="onDragStart"
  >
    <div class="thumb" :style="{ background: coverVar(current.source_type) }">
      <SourceBadge :source="current.source_type" />
    </div>
    <div class="track-meta">
      <div class="track-title">{{ title }}</div>
      <div class="track-artist">{{ artist }}</div>
    </div>
    <span
      class="icon-btn"
      :class="{ liked }"
      role="button"
      aria-label="лайк"
      @click.stop="toggleLike"
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
      </svg>
    </span>
    <span class="fab small" role="button" :aria-label="playing ? 'пауза' : 'играть'" @click.stop="togglePlay">
      <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5.5v13l11-6.5z" />
      </svg>
    </span>
    <div class="bar"><i :style="{ width: '38%' }" /></div>
  </button>
</template>

<script src="./MiniPlayer.ts" lang="ts"></script>
