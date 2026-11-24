<template>
  <div v-if="current" class="mp-viewport">
    <div
      ref="trackEl"
      class="mp-track"
      @pointerdown="onDragStart"
      @scroll="onScroll"
    >
      <div
        v-for="(pane, index) in panes"
        :key="index"
        class="mp-pane"
        :aria-hidden="index !== 1"
      >
        <div class="mini-player">
          <div class="thumb" :style="{ background: coverVar(pane.snapshot.source_type) }">
            <div
              v-if="index === 1 && clipActive"
              :ref="onClipHost"
              class="mp-clip-host"
              @click="onClipTap"
              @dblclick="onClipDblTap"
            >
              <div v-if="clipBuffering" class="clip-spinner" aria-hidden="true">
                <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <circle cx="12" cy="12" r="8" opacity=".25" />
                  <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
                </svg>
              </div>
            </div>
            <template v-if="pane.snapshot.type === 'video'">
              <img v-if="pane.snapshot.cover_url" class="mp-cover" :src="pane.snapshot.cover_url" alt="">
              <span class="vid-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="6" width="18" height="12" rx="2" />
                  <path d="M10.2 9.6v4.8l4.2-2.4z" fill="currentColor" stroke="none" />
                </svg>
              </span>
            </template>
            <template v-else>
              <img v-if="pane.snapshot.type === 'track'" :src="trackCover(pane.snapshot)" alt="">
              <SourceBadge :source="pane.snapshot.source_type" />
            </template>
          </div>
          <div class="track-meta">
            <div class="track-title">{{ pane.title }}</div>
            <div class="track-artist">{{ pane.artist }}</div>
          </div>
          <span
            class="icon-btn"
            :class="{ liked: index === 1 && liked }"
            role="button"
            aria-label="лайк"
            @click.stop="onLike(index)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
            </svg>
          </span>
          <span class="fab small" role="button" :aria-label="playing && index === 1 ? 'пауза' : 'играть'" @click.stop="onTogglePlay(index)">
            <svg v-if="playing && index === 1" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
          <div class="bar"><i :style="{ width: progress + '%' }" /></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script src="./MiniPlayer.ts" lang="ts"></script>

<style scoped src="./MiniPlayer.css"></style>
