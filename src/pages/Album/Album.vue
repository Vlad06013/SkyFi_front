<template>
  <div>
    <AppBar back />
    <div v-if="loading && !album" class="loading-line">
      <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="12" cy="12" r="8" opacity=".25" />
        <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
      </svg>
    </div>
    <div v-else-if="error && !album" class="empty" style="padding-top:28px">
      <div class="et">{{ error }}</div>
      <button class="btn btn-primary" type="button" style="margin-top:12px" @click="retry">Повторить</button>
    </div>
    <template v-else-if="album">
      <div class="hero-cover" :style="{ background: coverVar(album.source_type) }">
        <img v-if="album.cover_url" :src="album.cover_url" alt="">
        <SourceBadge :source="album.source_type" />
      </div>
      <div class="hero-name">{{ album.title }}</div>
      <div class="hero-sub">Альбом</div>
      <div class="hero-sub">{{ artistsLine(album.artists) }}<template v-if="album.year"> · {{ album.year }}</template></div>
      <div class="hero-actions">
        <button class="fab small" type="button" aria-label="играть" @click="playAll">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
        </button>
      </div>
      <SnapshotRow
        v-for="track in tracks"
        :key="track.source_id"
        :title="track.title"
        :subtitle="artistsLine(track.artists)"
        :source="track.source_type"
        :cover="trackCover(track)"
        :liked="favorites.has(track)"
        :playing="isPlaying(track)"
        @open="player.playOrToggle(track, playSourceAlbum, { contextItems: tracks })"
        @menu="openSnapshotMenu($event, track, 'my-album-track')"
      />
      <div v-if="!tracks.length" class="empty">
        <div class="et">В альбоме нет треков</div>
      </div>
      <div v-if="loadingMore" class="loading-line">
        <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <circle cx="12" cy="12" r="8" opacity=".25" />
          <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
        </svg>
      </div>
      <div v-else-if="hasMore" ref="sentinel" class="more-sentinel" aria-hidden="true" />
      <div v-if="error && album" class="empty" style="padding-top:12px">
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

<script src="./Album.ts" lang="ts"></script>
