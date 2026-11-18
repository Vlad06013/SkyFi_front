<template>
  <div>
    <AppBar back />
    <div class="f-head">
      <div class="avatar ini lg" :class="friend.tone">{{ friend.initial }}</div>
      <div class="f-name">{{ friend.name }}</div>
      <div class="f-mail">{{ friend.email }}</div>
    </div>
    <div v-if="friend.current_snapshot" class="now-card">
      <div class="thumb" :style="{ background: coverVar(friend.current_snapshot.source_type) }">
        <SourceBadge :source="friend.current_snapshot.source_type" />
      </div>
      <div class="track-meta">
        <div class="track-title">{{ friend.current_snapshot.title }}</div>
        <div class="track-artist">{{ artistsLine(friend.current_snapshot.artists) }}</div>
        <div class="live">слушает сейчас</div>
      </div>
      <button class="fab small" type="button" aria-label="включить у себя" @click="playNow">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
      </button>
    </div>
    <div class="sec-label">Избранное</div>
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

<script src="./Friend.ts" lang="ts"></script>
