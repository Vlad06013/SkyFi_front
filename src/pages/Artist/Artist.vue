<template>
  <div>
    <AppBar back />
    <div v-if="loading && !artist" class="loading-line">
      <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="12" cy="12" r="8" opacity=".25" />
        <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
      </svg>
    </div>
    <div v-else-if="error && !artist" class="empty" style="padding-top:28px">
      <div class="et">{{ error }}</div>
      <button class="btn btn-primary" type="button" style="margin-top:12px" @click="retry">Повторить</button>
    </div>
    <template v-else-if="artist">
      <div class="hero-cover round" :style="{ background: coverVar(artist.source_type) }">
        <img v-if="artist.cover_url" :src="artist.cover_url" alt="">
        <SourceBadge :source="artist.source_type" />
      </div>
      <div class="hero-name">{{ artist.title }}</div>
      <div class="hero-sub">Исполнитель</div>
      <div class="hero-actions">
        <button class="fab small" type="button" aria-label="играть" @click="playAll">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
        </button>
      </div>
      <div class="chips is-center">
        <button
          v-for="chip in chips"
          :key="chip.id"
          class="chip"
          :class="{ active: tab === chip.id }"
          type="button"
          @click="tab = chip.id"
        >
          {{ chip.label }}
        </button>
      </div>
      <template v-if="tab === 'tracks'">
        <SnapshotRow
          v-for="track in tracks"
          :key="track.source_id"
          :title="track.title"
          :subtitle="artistsLine(track.artists)"
          :source="track.source_type"
          :cover="trackCover(track)"
          :liked="favorites.has(track)"
          :playing="isPlaying(track)"
          @open="player.playOrToggle(track, playSourceArtist, { contextItems: tracks })"
          @menu="openSnapshotMenu($event, track, 'my-album-track')"
        />
        <div v-if="!tracks.length" class="empty">
          <div class="et">Треков нет</div>
        </div>
        <div v-if="loadingMore" class="loading-line">
          <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <circle cx="12" cy="12" r="8" opacity=".25" />
            <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
          </svg>
        </div>
        <div v-else-if="hasMore" ref="sentinel" class="more-sentinel" aria-hidden="true" />
      </template>
      <template v-else>
        <SnapshotRow
          v-for="album in albums"
          :key="album.source_id"
          kind="media"
          :title="album.title"
          :subtitle="albumLine(album)"
          :source="album.source_type"
          :cover="album.cover_url ?? ''"
          :liked="favorites.has(album)"
          @open="openAlbum(album)"
          @menu="openSnapshotMenu($event, album, 'my-albums')"
        />
        <div v-if="!albums.length" class="empty">
          <div class="et">Альбомов нет</div>
        </div>
      </template>
      <div v-if="error && artist" class="empty" style="padding-top:12px">
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

<script src="./Artist.ts" lang="ts"></script>
