<template>
  <div v-if="isTv" class="tv-home" :class="{ 'is-clip': clipActive, 'is-clip-idle': clipWatch }">
    <div
      v-if="clipActive"
      :ref="onHomeClipHost"
      class="tv-clip-host"
      :class="{ 'is-frame': homeFrame }"
    />
    <img v-if="showHomePoster" class="tv-clip-poster" :src="coverSrc" alt="">
    <section class="tv-hero" :class="{ 'is-clip': clipActive }">
      <div v-if="clipActive" class="tv-clip-shade" />
      <div class="tv-hero-copy" :inert="clipWatch || undefined">
        <div class="tv-kicker">{{ clipActive ? 'Клип' : (current ? 'Сейчас играет' : 'Волна') }}</div>
        <h2>{{ title || 'Ничего не играет' }}</h2>
        <div v-if="heroMeta" class="tv-meta">{{ heroMeta }}</div>
        <div class="tv-actions">
          <button class="tv-play" type="button" @click="onListen">
            <svg v-if="playing && current" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
            {{ playing && current ? 'Пауза' : 'Слушать' }}
          </button>
          <button v-if="showJoinWave && !clipActive" class="tv-ghost" type="button" @click="joinWave">В волну</button>
          <button
            v-if="current && current.type !== 'video'"
            class="tv-ghost"
            :class="{ 'is-on': clipMode }"
            type="button"
            @click="toggleClips"
          >
            {{ clipMode ? 'Выключить клип' : 'Клип' }}
          </button>
          <button
            v-if="current"
            class="tv-icon"
            :class="{ liked }"
            type="button"
            aria-label="в избранном"
            @click="toggleLike"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
            </svg>
          </button>
        </div>
      </div>
      <div v-if="!clipActive && current" class="tv-disc" :class="{ 'is-on': playing }" aria-hidden="true">
        <span class="tv-face" :style="{ background: coverVar(current.source_type) }">
          <img v-if="discCover" :src="discCover" alt="">
          <SourceBadge :source="current.source_type" />
        </span>
      </div>
    </section>
    <section class="tv-shelf">
      <h3>Избранное</h3>
      <div v-if="!shelfTracks.length" class="tv-shelf-empty">В избранном пока нет треков</div>
      <div v-else ref="shelfEl" class="tv-posters">
        <button
          v-for="track in shelfTracks"
          :key="track.source_type + ':' + track.source_id"
          class="tv-poster"
          :class="{ 'is-on': isCurrentTrack(track) }"
          type="button"
          @click="playFavorite(track)"
        >
          <span class="art" :style="{ background: coverVar(track.source_type) }">
            <img v-if="trackCover(track)" :src="trackCover(track)" alt="">
          </span>
          <span class="poster-title">{{ track.title }}</span>
          <span class="poster-sub">{{ artistsLine(track.artists) }}</span>
        </button>
        <span v-if="shelfHasMore" ref="shelfSentinel" class="tv-shelf-more" />
      </div>
    </section>
  </div>
  <div v-else class="wave-page">
    <div class="appbar">
      <button class="icon-btn ghost n-bell" type="button" aria-label="уведомления" @click.stop="toggleBell">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6.5 9.5a5.5 5.5 0 1 1 11 0c0 5.5 2.5 6.5 2.5 8H4c0-1.5 2.5-2.5 2.5-8z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        <i v-if="hasUnread" class="badge-dot" />
      </button>
    </div>
    <div class="wave-stage" :class="{ 'is-video': clipActive }">
      <div class="wave-blobs" aria-hidden="true">
        <span class="wave-blob wave-blob-a" />
        <span class="wave-blob wave-blob-b" />
        <span class="wave-blob wave-blob-c" />
      </div>
      <button v-if="showJoinWave" class="wave-return" type="button" @click="joinWave">В волну</button>
      <div class="wave-disc" role="button" tabindex="0" aria-label="развернуть плеер" @click="openExpanded">
        <div class="wave-flame" :class="{ 'wave-flame-on': playing }" aria-hidden="true">
          <span class="wave-flame-ring" />
          <span class="wave-flame-tongue wave-flame-tongue-1" />
          <span class="wave-flame-tongue wave-flame-tongue-2" />
          <span class="wave-flame-tongue wave-flame-tongue-3" />
        </div>
        <div class="cover" :style="{ background: current ? coverVar(current.source_type) : 'var(--gradient-cover-1)' }">
          <div
            v-if="clipActive"
            :ref="onHomeClipHost"
            class="home-clip-host"
            :class="{ 'is-frame': homeFrame }"
          />
          <img v-if="coverSrc" class="home-cover" :class="{ 'is-behind': homeFrame }" :src="coverSrc" alt="">
          <SourceBadge v-if="current" :source="current.source_type" />
          <div v-if="audioLoading || clipBuffering" class="clip-spinner" aria-hidden="true">
            <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="12" cy="12" r="8" opacity=".25" />
              <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
            </svg>
          </div>
        </div>
      </div>
      <div class="wave-pill" role="button" tabindex="0" aria-label="развернуть плеер" @click="openExpanded">
        <span class="wave-pill-fill" :class="{ 'is-smooth': progressSmooth }" :style="{ width: progress + '%' }" />
        <span class="wave-pill-text">{{ artist }} — {{ title }}</span>
        <button class="icon-btn" :class="{ liked }" type="button" aria-label="в избранном" @click.stop="toggleLike">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
          </svg>
        </button>
      </div>
      <div class="wave-controls">
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
      </div>
    </div>
  </div>
</template>

<script src="./Home.ts" lang="ts"></script>

<style scoped src="./Home.css"></style>
