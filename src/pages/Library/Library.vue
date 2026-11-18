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
      <span class="dl-count" />
      <div class="dl-bar-side">
        <button class="icon-btn ghost" type="button" aria-label="загрузить трек" @click="uploadOpen = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>

    <div v-if="showDownloadAll" class="dl-all-bar">
      <span class="dl-count">{{ counts[tab] }}</span>
      <div v-if="tab !== 'videos'" class="dl-bar-side">
        <button v-if="tab === 'playlists'" class="icon-btn ghost" type="button" aria-label="новый плейлист" @click="openCreate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <div class="dl-all-wrap">
          <span v-if="dlAllStatus === 'done'" class="dl-all is-done">Скачано</span>
          <button
            v-else
            class="dl-all"
            :class="{ 'is-run': dlAllStatus === 'run' }"
            type="button"
            :aria-label="dlAllStatus === 'run' ? `скачивается ${dlAllPct}%` : 'скачать все'"
            @click="downloadAllTab"
          >
            <template v-if="dlAllStatus === 'run'">
              <svg class="ring spin" viewBox="0 0 36 36" aria-hidden="true">
                <circle class="track" cx="18" cy="18" r="15" />
                <circle class="arc" cx="18" cy="18" r="15" transform="rotate(-90 18 18)" :style="{ strokeDasharray: `${dlAllArc} 94` }" />
              </svg>
              <span class="pct">{{ dlAllPct }}%</span>
            </template>
            <template v-else>
              <svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" /></svg>
              <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 5v12m0 0 4.6-4.6M12 17l-4.6-4.6" />
              </svg>
            </template>
          </button>
          <span v-if="dlAllStatus !== 'done'" class="dl-all-cap">Скачать</span>
        </div>
      </div>
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
        :liked="favorites.has(track)"
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
      <MediaRow
        v-for="pl in playlists"
        :key="pl.source_id"
        :title="pl.title"
        :subtitle="`${pl.item_count} · ${pl.owner_name}`"
        :source="pl.source_type"
        @open="openPlaylist(pl.source_id)"
        @menu="openSnapshotMenu($event, pl, 'collection', pl.owner_name ?? undefined)"
      />
    </template>

    <template v-else-if="tab === 'albums'">
      <MediaRow
        v-for="album in albums"
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
        v-for="artist in artists"
        :key="artist.source_id"
        :title="artist.title"
        subtitle="Исполнитель"
        :source="artist.source_type"
        round
        @open="openArtist(artist.source_id)"
        @menu="openSnapshotMenu($event, artist, 'collection')"
      />
    </template>

    <template v-else-if="tab === 'videos'">
      <VideoRow
        v-for="video in videos"
        :key="video.source_id"
        :title="video.title"
        :subtitle="`${artistsLine(video.artists)} · клип`"
        :source="video.source_type"
        :cover="video.cover_url ?? ''"
        @open="player.playSnapshot(video)"
        @menu="openSnapshotMenu($event, video, 'video')"
      />
    </template>

    <template v-else-if="tab === 'uploads'">
      <TrackRow
        v-for="track in uploads"
        :key="track.source_id"
        :title="track.title"
        :artist="artistsLine(track.artists)"
        :source="track.source_type"
        @play="player.playSnapshot(track)"
        @menu="openSnapshotMenu($event, track, 'track')"
      />
    </template>

    <template v-else-if="tab === 'downloaded'">
      <TrackRow
        v-for="track in downloaded"
        :key="track.source_id"
        :title="track.title"
        :artist="artistsLine(track.artists)"
        :source="track.source_type"
        @play="player.playSnapshot(track)"
        @menu="openSnapshotMenu($event, track, 'track')"
      >
        <svg
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
    </template>

    <div v-else class="empty" style="padding-top:28px">
      <div class="et">Пусто</div>
      <div class="es">Здесь пока ничего нет</div>
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

    <div v-if="createOpen" class="sheet-mask" @click.self="createOpen = false">
      <div class="sheet">
        <div class="handle" />
        <div class="sheet-title">Новый плейлист</div>
        <PlaylistForm submit-label="Создать" @submit="createPlaylist" />
      </div>
    </div>

    <div v-if="uploadOpen" class="sheet-mask" @click.self="uploadOpen = false">
      <div class="sheet">
        <div class="handle" />
        <div class="sheet-title">Загрузить трек</div>
        <UploadForm @upload="onUpload" />
      </div>
    </div>

    <div v-if="editing" class="sheet-mask" @click.self="editing = null">
      <div class="sheet">
        <div class="handle" />
        <div class="sheet-title">Изменить плейлист</div>
        <PlaylistForm
          submit-label="Сохранить"
          :initial-name="editing.title"
          :initial-cover="editing.cover_url"
          @submit="savePlaylist"
        />
      </div>
    </div>
  </div>
</template>

<script src="./Library.ts" lang="ts"></script>
