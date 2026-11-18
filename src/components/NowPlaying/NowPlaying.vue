<template>
  <div
    v-if="expanded && current"
    class="now-playing"
    :class="{ 'is-dragging': playerDragging, 'is-clip': clipMode }"
    :style="playerDragStyle"
    @pointerdown="onPlayerDragStart"
  >
    <img v-if="clipMode" class="clip-bg" :src="clipFrame" alt="">
    <div v-if="clipMode" class="clip-scrim" />

    <div class="now-playing-inner">
      <div class="now-top">
        <button class="icon-btn ghost" type="button" :aria-label="topLabel" @click="onTop">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9.5 12 15.5 18 9.5" />
          </svg>
        </button>
        <span v-if="clipMode" class="q-chip">720</span>
        <span v-else />
      </div>

      <div
        class="now-stage"
        :class="{ 'is-list': layer !== 'now' }"
      >
        <template v-if="layer === 'queue'">
          <div class="p-now">
            <div class="thumb" :style="{ background: coverVar(current.source_type) }">
              <SourceBadge :source="current.source_type" />
            </div>
            <div class="track-meta">
              <div class="track-title">{{ title }}</div>
              <div class="track-artist">{{ artist }}</div>
            </div>
            <span v-if="playing" class="eq" aria-hidden="true"><i /><i /><i /></span>
            <button class="fab small" type="button" :aria-label="playing ? 'пауза' : 'играть'" @click="togglePlay">
              <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </button>
          </div>
          <div
            class="p-sheet"
            :class="{ 'is-dragging': queueDragging }"
            :style="queueSheetStyle"
          >
            <div class="p-sheet-head" @pointerdown="onQueueDragStart">
              <div class="handle" />
              <div class="sh-title">Очередь</div>
            </div>
            <div class="p-sheet-body list-sort" :class="{ 'is-sorting': Boolean(sortDrag) }">
              <TrackRow
                v-for="(track, index) in queue"
                :key="track.source_id"
                :title="track.title"
                :artist="artistsLine(track.artists)"
                :source="track.source_type"
                sortable
                :menuable="false"
                :dragging="sortDrag?.from === index"
                :drag-style="sortRowStyle(index, sortDrag)"
                @play="playSnapshot(track)"
                @sort="onSortStart($event, index)"
              />
            </div>
          </div>
        </template>

        <div v-else-if="layer === 'lyrics'" class="lyr">
          <div>эфир гудит в ночи</div>
          <div class="now">радиотишина</div>
          <div>не выключай меня</div>
          <div>я буду здесь</div>
        </div>

        <div
          v-else-if="!clipMode"
          class="cover-big"
          :style="{ background: coverVar(current.source_type) }"
        >
          <SourceBadge :source="current.source_type" />
        </div>
      </div>

      <div class="now-footer">
      <div class="p-title">{{ title }}</div>
      <div class="p-artist">
        {{ artist }}<template v-if="album && layer !== 'lyrics'"> · {{ album }}</template>
      </div>

      <SeekBar
        class="seek"
        :model-value="progress"
        label="позиция"
        @update:model-value="seekRatio($event / 100)"
      />
      <div class="p-times">
        <span>{{ formatTime(state.position_seconds) }}</span>
        <span>{{ formatTime(durationSeconds) }}</span>
      </div>

      <div class="p-controls">
        <div class="side">
          <button
            class="plain"
            type="button"
            :class="{ 'is-on': state.shuffle_enabled }"
            aria-label="перемешать"
            @click="toggleShuffle"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7h4l10 10h4m0 0-2.5-2.5M21 17l-2.5 2.5M3 17h4l2.5-2.5M13.5 9.5 17 7h4m0 0L18.5 4.5M21 7l-2.5 2.5" />
            </svg>
          </button>
        </div>
        <button class="plain" type="button" aria-label="назад" @click="skipPrevious">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 6.5 10 12l8 5.5zM6 6.5h2.5v11H6z" /></svg>
        </button>
        <button class="fab" type="button" :aria-label="playing ? 'пауза' : 'играть'" @click="togglePlay">
          <svg v-if="playing" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        </button>
        <button class="plain" type="button" aria-label="вперёд" @click="skipNext">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6.5l8 5.5-8 5.5zM15.5 6.5H18v11h-2.5z" /></svg>
        </button>
        <div class="side">
          <button
            class="plain"
            type="button"
            :class="{ 'is-on': state.repeat_mode !== 'off' }"
            :aria-label="repeatLabel"
            @click="toggleRepeat"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 9V7a3 3 0 0 1 3-3h11m0 0-2.5-2.5M18 4.5 20.5 7M20 15v2a3 3 0 0 1-3 3H6m0 0 2.5 2.5M6 20.5 3.5 18" />
              <path
                v-if="state.repeat_mode === 'one'"
                fill="currentColor"
                stroke="none"
                d="M11.05 8.15h1.9v7.7h-1.9zm-1.2 1.7L12 8.15h.95v1.7L10.4 11.2z"
              />
            </svg>
          </button>
        </div>
      </div>

      <div class="p-actions">
        <button class="plain" type="button" :class="{ liked }" aria-label="в избранном" @click="toggleLike">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
          </svg>
        </button>
        <button
          class="plain"
          type="button"
          :class="{ 'is-on': layer === 'queue' }"
          aria-label="очередь"
          @click.stop="openQueue"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h11M3 12h11M3 18h6.5" />
            <path d="M13.6 7 22 12l-8.4 5z" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <button
          class="plain"
          type="button"
          :class="{ 'is-on': clipMode }"
          aria-label="клипы"
          @click.stop="onClips"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M10.2 9.6v4.8l4.2-2.4z" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <button class="plain" type="button" aria-label="ещё" @click.stop="openNowMenu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <circle cx="6" cy="12" r="1.4" fill="currentColor" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" />
            <circle cx="18" cy="12" r="1.4" fill="currentColor" />
          </svg>
        </button>
      </div>
      </div>
    </div>

    <MediaOverlays
      :open="open"
      :top="top"
      :right="right"
      :variant="variant"
      :sheet="sheet"
      :entity="entity"
      @close="closeMenu"
      @action="run"
      @update:sheet="sheet = $event"
    />
  </div>
</template>

<script src="./NowPlaying.ts" lang="ts"></script>

<style scoped src="./NowPlaying.css"></style>
