<template>
  <div
    v-if="expanded && current"
    ref="rootEl"
    class="now-playing"
    :class="{ 'is-dragging': playerDragging, 'is-clip': clipMode, 'is-clip-idle': clipIdle, 'has-frame': clipFrameReady }"
    :style="playerDragStyle"
    @pointerdown="onPlayerDragStart"
    @pointermove="onClipPointerMove"
    @click="onClipTap"
    @dblclick="onClipDblTap"
  >
    <img v-if="clipMode && clipPoster" class="clip-bg" :src="clipPoster" alt="">
    <div v-if="clipMode" class="clip-scrim" />
    <div v-if="clipMode" ref="clipHostEl" class="clip-host" />
    <div v-if="clipMode && clipBuffering" class="clip-spinner" aria-hidden="true">
      <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="12" cy="12" r="8" opacity=".25" />
        <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
      </svg>
    </div>

    <div class="now-playing-inner">
      <div class="now-top">
        <button class="icon-btn ghost" type="button" :aria-label="topLabel" @click="onTop">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9.5 12 15.5 18 9.5" />
          </svg>
        </button>
        <div v-if="clipMode" class="clip-top-side">
          <button
            v-if="clipAudioTracks.length > 1"
            class="q-chip"
            type="button"
            aria-label="звуковая дорожка"
            @click.stop="onAudioChip"
          >
            {{ activeAudioLabel }}
          </button>
          <button class="q-chip" type="button" aria-label="качество клипа" @click.stop="onQualityChip">
            {{ clipHlsActive && clipHlsAuto ? 'авто' : clipQuality }}
          </button>
          <button
            class="icon-btn ghost"
            type="button"
            :aria-label="isFullscreen ? 'свернуть экран' : 'во весь экран'"
            @click.stop="toggleFullscreen"
          >
            <svg
              v-if="!isFullscreen"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
            </svg>
            <svg
              v-else
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5a1.5 1.5 0 0 1 1.5 1.5V20" />
            </svg>
          </button>
        </div>
        <span v-else />
      </div>

      <div v-if="qualityOpen" class="clip-quality-mask" @pointerdown.stop="qualityOpen = false" />
      <div v-if="qualityOpen" class="select-menu clip-quality">
        <button
          v-if="clipHlsActive"
          type="button"
          class="select-opt"
          :class="{ 'is-on': clipHlsAuto }"
          @click="pickQualityAuto"
        >
          <span>Авто<span class="osub">{{ clipHlsAuto ? 'активно' : 'выбрать' }}</span></span>
          <svg
            v-if="clipHlsAuto"
            class="tick"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M5 12.5 9.5 17 19 7.5" />
          </svg>
        </button>
        <button
          v-for="quality in clipQualities"
          :key="quality"
          type="button"
          class="select-opt"
          :class="{ 'is-on': quality === clipQuality && (!clipHlsActive || !clipHlsAuto), 'is-disabled': !clipQualityAvailable(quality) }"
          :disabled="!clipQualityAvailable(quality)"
          @click="pickQuality(quality)"
        >
          <span>{{ quality }}<span class="osub">{{ quality === clipQuality && (!clipHlsActive || !clipHlsAuto) ? 'активно' : 'выбрать' }}</span></span>
          <svg
            v-if="quality === clipQuality && (!clipHlsActive || !clipHlsAuto)"
            class="tick"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M5 12.5 9.5 17 19 7.5" />
          </svg>
        </button>
      </div>

      <template v-if="clipAudioTracks.length > 1">
        <div v-if="audioOpen" class="clip-quality-mask" @pointerdown.stop="audioOpen = false" />
        <div v-if="audioOpen" class="select-menu clip-quality">
          <button
            v-for="track in clipAudioTracks"
            :key="track.id"
            type="button"
            class="select-opt"
            :class="{ 'is-on': track.id === activeAudioId }"
            @click="pickAudio(track.id)"
          >
            <span>{{ track.label }}<span class="osub">{{ track.id === activeAudioId ? 'активно' : 'выбрать' }}</span></span>
            <svg
              v-if="track.id === activeAudioId"
              class="tick"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 12.5 9.5 17 19 7.5" />
            </svg>
          </button>
        </div>
      </template>

      <div
        class="now-stage"
        :class="{ 'is-list': layer !== 'now' }"
      >
        <template v-if="layer === 'queue'">
          <div class="p-now">
            <div class="thumb" :style="{ background: coverVar(current.source_type) }">
              <img v-if="current.type === 'track'" :src="trackCover(current)" alt="">
              <img v-else-if="current.cover_url" :src="current.cover_url" alt="">
              <SourceBadge :source="current.source_type" />
            </div>
            <div class="track-meta">
              <div class="track-title">{{ title }}</div>
              <div class="track-artist">{{ artist }}</div>
            </div>
            <span v-if="playing" class="eq" aria-hidden="true"><i /><i /><i /></span>
            <button class="fab small" type="button" :aria-label="playing ? 'пауза' : 'играть'" @click.stop="togglePlay">
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
              <SnapshotRow
                v-for="({ item, snapshot }, index) in queueRows"
                :key="item.id"
                :kind="queueRowKind(snapshot)"
                :title="snapshot.title"
                :subtitle="artistsLine(snapshot.artists)"
                :source="snapshot.source_type"
                :cover="queueRowCover(snapshot)"
                :round="snapshot.type === 'artist'"
                sortable
                removable
                :menuable="false"
                :dragging="sortDrag?.from === index"
                :drag-style="sortRowStyle(index, sortDrag)"
                @open="playFromQueue(snapshot)"
                @sort="onSortStart($event, index)"
                @remove="removeQueueItem(item.id)"
              />
              <div v-if="queueLoaded && !queueRows.length" class="empty" style="padding-top:20px">
                <div class="et">Очередь пуста</div>
              </div>
            </div>
          </div>
        </template>

        <div v-else-if="layer === 'lyrics'" ref="lyrEl" class="lyr">
          <template v-if="lyricLoading">
            <div>загружаем текст…</div>
          </template>
          <template v-else-if="lyricError">
            <div>{{ lyricError }}</div>
            <div>
              <button class="btn btn-ghost sm" type="button" @click="retryLyrics">повторить</button>
            </div>
          </template>
          <template v-else-if="lyricLines">
            <div
              v-for="(line, index) in lyricLines"
              :key="index"
              :class="{ now: lyricSynced && index === activeLyricLine }"
            >{{ line.text }}</div>
          </template>
          <template v-else>
            <div>текст не найден</div>
          </template>
        </div>

        <div
          v-else-if="!clipMode"
          class="cover-big"
          :style="{ background: coverVar(current.source_type) }"
        >
          <img v-if="current.type === 'track'" :src="trackCover(current)" alt="">
          <SourceBadge :source="current.source_type" />
          <div v-if="audioLoading" class="clip-spinner" aria-hidden="true">
            <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="12" cy="12" r="8" opacity=".25" />
              <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
            </svg>
          </div>
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
        :buffered="bufferedRanges"
        label="позиция"
        @update:model-value="seekRatio($event / 100)"
      />
      <div class="p-times">
        <span>{{ formatTime(positionSeconds) }}</span>
        <span>{{ formatTime(durationSeconds) }}</span>
      </div>

      <div class="p-controls" @click.stop>
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
        <button class="fab" type="button" :aria-label="playing ? 'пауза' : 'играть'" @click.stop="togglePlay">
          <svg v-show="playing" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          </svg>
          <svg v-show="!playing" viewBox="0 0 24 24" fill="currentColor">
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
      :items="items"
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
