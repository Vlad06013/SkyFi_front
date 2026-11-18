<template>
  <div>
    <AppBar title="Моё" badge />
    <div class="chip-scroll">
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

    <div v-if="showDownloadAll" class="dl-all-bar">
      <span class="dl-count">{{ counts[tab] }}</span>
      <button v-if="tab === 'playlists'" class="dl-all is-run" type="button" aria-label="скачивается 42%">
        <svg class="ring spin" viewBox="0 0 36 36" aria-hidden="true">
          <circle class="track" cx="18" cy="18" r="15" />
          <circle class="arc" cx="18" cy="18" r="15" transform="rotate(-90 18 18)" />
        </svg>
        <span class="pct">42%</span>
      </button>
      <span v-else-if="tab === 'albums'" class="dl-all is-done">Скачано</span>
      <button v-else class="dl-all" type="button" aria-label="скачать все">
        <svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" /></svg>
        <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5v12m0 0 4.6-4.6M12 17l-4.6-4.6" />
        </svg>
      </button>
    </div>

    <div v-if="tab === 'tracks'" class="list-sort" :class="{ 'is-sorting': Boolean(sortDrag) }">
      <TrackRow
        v-for="(track, index) in tracks"
        :key="track.source_id"
        :title="track.title"
        :artist="isOffline(track) ? 'нет в офлайне' : artistsLine(track.artists)"
        :source="track.source_type"
        :playing="isPlaying(track)"
        :offline="isOffline(track)"
        sortable
        :dragging="sortDrag?.from === index"
        :drag-style="sortRowStyle(index, sortDrag)"
        @play="player.playSnapshot(track)"
        @menu="openSnapshotMenu($event, track, 'track')"
        @sort="onSort($event, index)"
      >
        <svg
          v-if="isDownloaded(track)"
          class="dl-mark"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-label="скачан"
        >
          <path d="M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5" />
          <path d="M5 17h14" />
        </svg>
      </TrackRow>
    </div>

    <template v-else-if="tab === 'playlists'">
      <div class="pl-row">
        <div class="pl-new">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
        <div class="track-meta">
          <div class="track-title">Новый плейлист</div>
          <div class="track-artist">имя и видимость</div>
        </div>
      </div>
      <MediaRow
        v-for="pl in playlists"
        :key="pl.source_id"
        :title="pl.title"
        :subtitle="`${pl.item_count} · ${pl.owner_name}`"
        :source="pl.source_type"
        @open="openPlaylist(pl.source_id)"
        @menu="openSnapshotMenu($event, pl, pl.source_type === 'skyfi' ? 'own-playlist' : 'collection', pl.owner_name ?? undefined)"
      />
    </template>

    <template v-else-if="tab === 'albums'">
      <MediaRow
        v-for="album in favoriteAlbums"
        :key="album.source_id"
        :title="album.title"
        :subtitle="`${artistsLine(album.artists)} · ${album.year}`"
        :source="album.source_type"
        @open="openAlbum(album.source_id)"
        @menu="openSnapshotMenu($event, album, 'collection')"
      />
    </template>

    <template v-else-if="tab === 'artists'">
      <MediaRow
        v-for="artist in favoriteArtists"
        :key="artist.source_id"
        :title="artist.title"
        subtitle="Исполнитель"
        :source="artist.source_type"
        round
        @open="openArtist(artist.source_id)"
        @menu="openSnapshotMenu($event, artist, 'collection')"
      />
    </template>

    <div v-else class="empty" style="padding-top:28px">
      <div class="et">{{ tab === 'uploads' ? 'Свои файлы' : 'Скачано' }}</div>
      <div class="es">{{ tab === 'uploads' ? 'Загрузки появятся здесь' : 'Офлайн целиком — плейлисты, альбомы, треки' }}</div>
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

<script src="./Library.ts" lang="ts"></script>
