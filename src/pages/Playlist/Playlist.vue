<template>
  <div>
    <AppBar back />
    <div class="hero-cover" :style="{ background: coverVar(playlist.source_type) }">
      <SourceBadge :source="playlist.source_type" />
    </div>
    <div class="hero-name">{{ playlist.title }}</div>
    <div class="hero-sub">Плейлист</div>
    <div class="hero-sub">
      {{ playlist.item_count }} треков
      <template v-if="own"> · только друзья</template>
      <template v-else> · {{ playlist.owner_name }}</template>
    </div>
    <div class="hero-actions">
      <button class="fab small" type="button" aria-label="играть" @click="content[0] && player.playSnapshot(content[0])">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
      </button>
      <button class="icon-btn liked" type="button" aria-label="в избранном">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
        </svg>
      </button>
    </div>
    <template v-for="item in content" :key="item.source_id">
      <VideoRow
        v-if="item.type === 'video'"
        :title="item.title"
        :subtitle="`${artistsLine(item.artists)} · клип`"
        :source="item.source_type"
        :cover="item.cover_url ?? ''"
        @open="player.playSnapshot(item)"
        @menu="openSnapshotMenu($event, item, 'playlist-video')"
      />
      <TrackRow
        v-else
        :title="item.title"
        :artist="artistsLine(item.artists)"
        :source="item.source_type"
        :liked="favorites.has(item)"
        @play="player.playSnapshot(item)"
        @menu="openSnapshotMenu($event, item, 'playlist-track')"
      />
    </template>
    <div v-if="!content.length" class="empty">
      <div class="et">Пусто</div>
      <div class="es">Добавляйте треки через меню «⋯ → В плейлист»</div>
    </div>
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

<script src="./Playlist.ts" lang="ts"></script>
