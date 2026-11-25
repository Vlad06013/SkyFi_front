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

    <div v-if="tab === 'uploads'" class="dl-all-bar">
      <span class="dl-count">{{ counts.uploads }}</span>
      <div class="dl-bar-side">
        <button class="icon-btn ghost" type="button" aria-label="загрузить трек" @click="openUpload">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="tab === 'downloaded'" class="dl-all-bar">
      <span class="dl-count">{{ counts.downloaded }}</span>
    </div>

    <div v-if="showDownloadAll" class="dl-all-bar">
      <span class="dl-count">{{ counts[tab] }}</span>
      <div v-if="tab === 'tracks' || tab === 'playlists' || tab === 'albums'" class="dl-bar-side">
        <button v-if="tab === 'playlists'" class="icon-btn ghost" type="button" aria-label="новый плейлист" @click="openCreate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <span v-if="dlAllStatus === 'done'" class="dl-all is-done">Скачано</span>
        <button
          v-else
          class="dl-all"
          :class="{ 'is-run': dlAllActive, 'is-progress': dlAllArc > 0 }"
          type="button"
          :disabled="isOffline"
          :aria-label="dlAllActive ? `остановить скачивание, ${dlAllPct}%` : 'скачать все'"
          @click="downloadAllTab"
        >
          <svg v-if="dlAllActive" class="ring spin" viewBox="0 0 36 36" aria-hidden="true">
            <circle class="track" cx="18" cy="18" r="15" />
            <circle class="arc" cx="18" cy="18" r="15" />
          </svg>
          <svg v-else class="ring" viewBox="0 0 36 36" aria-hidden="true">
            <circle class="track" cx="18" cy="18" r="15" />
            <circle v-if="dlAllArc > 0" class="arc" cx="18" cy="18" r="15" transform="rotate(-90 18 18)" :style="{ strokeDasharray: `${dlAllArc} 94` }" />
          </svg>
          <span v-if="dlAllActive" class="pct">{{ dlAllPct }}%</span>
          <svg v-else class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5" />
            <path d="M5 17h14" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="tab === 'tracks'" class="list-sort" :class="{ 'is-sorting': Boolean(sortDrag) }">
      <SnapshotRow
        v-for="(track, index) in visibleTracks"
        :key="track.source_id"
        :title="track.title"
        :subtitle="artistsLine(track.artists)"
        :source="track.source_type"
        :source-id="track.source_id"
        :cover="trackCover(track)"
        :playing="isPlaying(track)"
        :downloaded="isDownloaded(track)"
        :duration-ms="track.duration_ms"
        sortable
        :dragging="sortDrag?.from === index"
        :drag-style="sortRowStyle(index, sortDrag)"
        @open="player.playOrToggle(track, playSourceFavorites, { contextItems: tracks })"
        @menu="openSnapshotMenu($event, track, 'my-tracks')"
        @sort="onSort($event, index)"
      />
    </div>

    <template v-else-if="tab === 'playlists'">
      <SnapshotRow
        v-for="pl in visiblePlaylists"
        :key="pl.source_id"
        kind="media"
        :title="pl.title"
        :subtitle="`${pl.item_count} · ${pl.owner_name}`"
        entity-type="playlist"
        :source="pl.source_type"
        :source-id="pl.source_id"
        :cover="snapshotCover(pl)"
        @open="openPlaylist(pl)"
        @menu="openSnapshotMenu($event, pl, 'my-playlists', pl.owner_name ?? undefined)"
      />
    </template>

    <template v-else-if="tab === 'albums'">
      <SnapshotRow
        v-for="album in visibleAlbums"
        :key="album.source_id"
        kind="media"
        :title="album.title"
        :subtitle="`${artistsLine(album.artists)} · ${album.year}`"
        entity-type="album"
        :source="album.source_type"
        :source-id="album.source_id"
        :cover="snapshotCover(album)"
        @open="openAlbum(album)"
        @menu="openSnapshotMenu($event, album, 'my-albums')"
      />
    </template>

    <template v-else-if="tab === 'artists'">
      <SnapshotRow
        v-for="artist in visibleArtists"
        :key="artist.source_id"
        kind="media"
        :title="artist.title"
        subtitle="Исполнитель"
        entity-type="artist"
        :source="artist.source_type"
        :source-id="artist.source_id"
        :cover="artist.cover_url ?? ''"
        round
        @open="openArtist(artist)"
        @menu="openSnapshotMenu($event, artist, 'my-artists')"
      />
    </template>

    <template v-else-if="tab === 'videos'">
      <SnapshotRow
        v-for="video in visibleVideos"
        :key="video.source_id"
        kind="video"
        :title="video.title"
        :subtitle="`${artistsLine(video.artists)} · клип`"
        entity-type="video"
        :source="video.source_type"
        :source-id="video.source_id"
        :cover="video.cover_url ?? ''"
        :playing="isPlayingVideo(video)"
        :duration-ms="video.duration_ms"
        @open="player.playOrToggle(video, playSourceFavorites, { contextItems: videos })"
        @menu="openSnapshotMenu($event, video, 'my-videos')"
      />
    </template>

    <template v-else-if="tab === 'uploads'">
      <SnapshotRow
        v-for="track in visibleUploads"
        :key="track.source_id"
        :title="track.title"
        :subtitle="artistsLine(track.artists)"
        :source="track.source_type"
        :source-id="track.source_id"
        :cover="trackCover(track)"
        :playing="isPlaying(track)"
        :duration-ms="track.duration_ms"
        @open="player.playOrToggle(track, playSourceUploads, { contextItems: uploads })"
        @menu="openSnapshotMenu($event, track, 'my-uploads')"
      />
    </template>

    <template v-else-if="tab === 'downloaded'">
      <SnapshotRow
        v-for="track in visibleDownloaded"
        :key="track.source_id"
        :title="track.title"
        :subtitle="artistsLine(track.artists)"
        :source="track.source_type"
        :source-id="track.source_id"
        :cover="trackCover(track)"
        :playing="isPlaying(track)"
        :downloaded="true"
        :duration-ms="track.duration_ms"
        @open="player.playOrToggle(track, playSourceSingle, { contextItems: downloaded })"
        @menu="openSnapshotMenu($event, track, 'my-downloaded')"
      />
    </template>

    <div v-if="listHasMore" ref="listSentinel" class="more-sentinel" aria-hidden="true" />

    <div v-if="listEmpty" class="empty" style="padding-top:28px">
      <div class="et">Пусто</div>
      <div class="es">Здесь пока ничего нет</div>
    </div>

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

    <AppSheet :open="createOpen" title="Новый плейлист" @close="createOpen = false">
      <PlaylistForm submit-label="Создать" @submit="createPlaylist" />
    </AppSheet>

    <AppSheet :open="uploadOpen" :title="uploadTitle" @close="uploadOpen = false">
      <UploadForm
        v-if="uploadOpen"
        :key="editingUpload?.source_id ?? 'new'"
        :initial-title="editingUpload?.title ?? ''"
        :initial-artists="editingUpload ? artistsLine(editingUpload.artists) : ''"
        :initial-album="editingUpload?.album?.title ?? ''"
        :initial-visibility="editingUpload?.visibility ?? 'public'"
        :require-file="!editingUpload"
        :progress="editingUpload ? null : uploadPct"
        :submit-label="editingUpload ? 'Сохранить' : 'Загрузить'"
        @upload="editingUpload ? saveUpload($event) : onUpload($event)"
      />
    </AppSheet>

    <AppSheet :open="Boolean(editing)" title="Изменить плейлист" @close="editing = null">
      <PlaylistForm
        v-if="editing"
        submit-label="Сохранить"
        :initial-name="editing.title"
        :initial-cover="editing.cover_url"
        @submit="savePlaylist"
      />
    </AppSheet>
  </div>
</template>

<script src="./Library.ts" lang="ts"></script>
