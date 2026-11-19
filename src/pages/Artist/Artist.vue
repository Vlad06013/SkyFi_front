<template>
  <div>
    <AppBar back />
    <div class="hero-cover round" :style="{ background: coverVar(artist.source_type) }">
      <img v-if="artist.cover_url" :src="artist.cover_url" alt="">
      <SourceBadge :source="artist.source_type" />
    </div>
    <div class="hero-name">{{ artist.title }}</div>
    <div class="hero-sub">Исполнитель</div>
    <div class="hero-actions">
      <button class="fab small" type="button" aria-label="играть" @click="player.playSnapshot(favoriteTracks[0])">
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
    </template>
    <template v-else>
      <SnapshotRow
        v-for="album in albums"
        :key="album.source_id"
        kind="media"
        :title="album.title"
        :subtitle="`${album.year} · ${album.track_count} треков`"
        :source="album.source_type"
        :cover="album.cover_url ?? ''"
        :liked="favorites.has(album)"
        @open="openAlbum(album.source_id)"
        @menu="openSnapshotMenu($event, album, 'my-albums')"
      />
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
