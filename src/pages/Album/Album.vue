<template>
  <div>
    <AppBar back />
    <div class="hero-cover" :style="{ background: coverVar(album.source_type) }">
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
    <TrackRow
      v-for="track in favoriteTracks"
      :key="track.source_id"
      :title="track.title"
      :artist="artistsLine(track.artists)"
      :source="track.source_type"
      @play="player.playSnapshot(track)"
      @menu="openSnapshotMenu($event, track, 'track')"
    />
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

<script src="./Album.ts" lang="ts"></script>
