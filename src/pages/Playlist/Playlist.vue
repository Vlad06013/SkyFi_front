<template>
  <div>
    <AppBar back />
    <div v-if="loading && !playlist" class="loading-line">
      <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="12" cy="12" r="8" opacity=".25" />
        <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
      </svg>
    </div>
    <div v-else-if="error && !playlist" class="empty" style="padding-top:28px">
      <div class="et">{{ error }}</div>
      <button class="btn btn-primary" type="button" style="margin-top:12px" @click="retry">Повторить</button>
    </div>
    <template v-else-if="playlist">
      <div class="hero-cover" :style="{ background: coverVar(playlist.source_type) }">
        <img v-if="snapshotCover(playlist)" :src="snapshotCover(playlist)" alt="">
        <SourceBadge :source="playlist.source_type" />
      </div>
      <div class="hero-name">{{ playlist.title }}</div>
      <div class="hero-sub">Плейлист</div>
      <div class="hero-sub">
        {{ playlist.item_count ?? tracks.length }} треков
        <template v-if="own"> · мой</template>
        <template v-else-if="playlist.owner_name"> · {{ playlist.owner_name }}</template>
      </div>
      <div class="hero-actions">
        <button class="fab small" type="button" aria-label="играть" @click="playAll">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
        </button>
        <button class="icon-btn" :class="{ liked }" type="button" aria-label="в избранном" @click="toggleLike">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
          </svg>
        </button>
      </div>
      <SnapshotRow
        v-for="track in tracks"
        :key="track.source_id"
        :title="track.title"
        :subtitle="artistsLine(track.artists)"
        :source="track.source_type"
        :source-id="track.source_id"
        :cover="trackCover(track)"
        :liked="favorites.has(track)"
        @open="player.playOrToggle(track, playSourcePlaylist, { contextItems: tracks, contextRef: playlist?.source_id ?? null })"
        @menu="openSnapshotMenu($event, track, 'my-playlist-track')"
      />
      <div v-if="!tracks.length" class="empty">
        <div class="et">Пусто</div>
        <div class="es">Добавляйте треки через меню «⋯ → В плейлист»</div>
      </div>
      <div v-if="loadingMore" class="loading-line">
        <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <circle cx="12" cy="12" r="8" opacity=".25" />
          <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
        </svg>
      </div>
      <div v-else-if="hasMore" ref="sentinel" class="more-sentinel" aria-hidden="true" />
      <div v-if="error && playlist" class="empty" style="padding-top:12px">
        <div class="et">{{ error }}</div>
        <button class="btn btn-secondary" type="button" style="margin-top:10px" @click="retry">Повторить</button>
      </div>
    </template>
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

<script src="./Playlist.ts" lang="ts"></script>
