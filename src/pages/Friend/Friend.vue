<template>
  <div>
    <AppBar back />
    <div class="f-head">
      <div class="avatar ini lg" :class="friend.tone">{{ friend.initial }}</div>
      <div class="f-name">{{ friend.name }}</div>
      <div class="f-mail">{{ friend.email }}</div>
      <div style="margin-top:10px">
        <button class="btn btn-danger sm" type="button" @click="removeFriend">Удалить из друзей</button>
      </div>
    </div>
    <div v-if="friend.current_snapshot && watching" class="now-card is-vid">
      <div class="preview">
        <img
          v-if="friend.current_snapshot.type === 'video'"
          :src="friend.current_snapshot.cover_url ?? ''"
          alt="кадр клипа"
        >
        <span class="vid-badge" aria-label="клип">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M10.2 9.6v4.8l4.2-2.4z" fill="currentColor" stroke="none" />
          </svg>
        </span>
      </div>
      <div class="meta">
        <div class="track-meta">
          <div class="track-title">{{ friend.current_snapshot.title }}</div>
          <div class="track-artist">{{ artistsLine(friend.current_snapshot.artists) }}</div>
          <div class="live">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="6" width="18" height="12" rx="2" />
              <path d="M10.2 9.6v4.8l4.2-2.4z" fill="currentColor" stroke="none" />
            </svg>
            смотрит сейчас
          </div>
        </div>
        <button class="fab small" type="button" aria-label="смотреть у себя" @click="playNow">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
        </button>
      </div>
    </div>
    <div v-else-if="friend.current_snapshot" class="now-card">
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
    <div class="sec-label">Очередь</div>
    <TrackRow
      v-for="track in friendQueue"
      :key="track.source_id"
      :title="track.title"
      :artist="artistsLine(track.artists)"
      :source="track.source_type"
      :liked="favorites.has(track)"
      @play="player.playSnapshot(track)"
      @menu="openSnapshotMenu($event, track, 'friend-track')"
    />
    <div class="sec-label">Избранное</div>
    <TrackRow
      v-for="track in favoriteTracks"
      :key="track.source_id"
      :title="track.title"
      :artist="artistsLine(track.artists)"
      :source="track.source_type"
      :liked="favorites.has(track)"
      @play="player.playSnapshot(track)"
      @menu="openSnapshotMenu($event, track, 'friend-track')"
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
