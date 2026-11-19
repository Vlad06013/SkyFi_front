<template>
  <div>
    <AppBar back />
    <div class="hero-cover" :style="{ background: coverVar(album.source_type) }">
      <img v-if="album.cover_url" :src="album.cover_url" alt="">
      <SourceBadge :source="album.source_type" />
    </div>
    <div class="hero-name">{{ album.title }}</div>
    <div class="hero-sub">Альбом</div>
    <div class="hero-sub">{{ artistsLine(album.artists) }} · {{ album.year }}</div>
    <div class="hero-actions">
      <button class="fab small" type="button" aria-label="играть" @click="player.playSnapshot(favoriteTracks[0])">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
      </button>
    </div>
    <SnapshotRow
      v-for="track in favoriteTracks"
      :key="track.source_id"
      :title="track.title"
      :subtitle="artistsLine(track.artists)"
      :source="track.source_type"
      :cover="trackCover(track)"
      :liked="favorites.has(track)"
      @open="player.playSnapshot(track)"
      @menu="openSnapshotMenu($event, track, 'my-album-track')"
    />
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
