<template>
  <div>
    <AppBar title="Поиск" badge />
    <div class="field" :class="{ 'is-focus': focused }">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M16.5 16.5 21 21" />
      </svg>
      <input
        v-model="query"
        placeholder="трек, ссылка, email"
        @focus="focused = true"
        @blur="focused = false"
      >
    </div>

    <template v-if="!hasQuery">
      <div class="sec-label">Недавние</div>
      <div class="hist">
        <button v-for="item in history" :key="item" class="chip" type="button" @click="useHistory(item)">
          {{ item }}
        </button>
      </div>
      <div class="empty" style="padding-top:28px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M16.5 16.5 21 21" />
        </svg>
        <div class="et">Ищите или вставьте ссылку</div>
        <div class="es">После запроса — пилюли. История только на устройстве.</div>
      </div>
    </template>

    <template v-else>
      <div class="chip-scroll">
        <button class="chip" :class="{ active: section === 'best' }" type="button" @click="section = 'best'">Лучшее</button>
        <button class="chip" :class="{ active: section === 'tracks' }" type="button" @click="section = 'tracks'">Треки</button>
        <button class="chip" :class="{ active: section === 'albums' }" type="button" @click="section = 'albums'">Альбомы</button>
        <button class="chip" :class="{ active: section === 'artists' }" type="button" @click="section = 'artists'">Артисты</button>
        <button class="chip" :class="{ active: section === 'playlists' }" type="button" @click="section = 'playlists'">Плейлисты</button>
        <button class="chip" :class="{ active: section === 'videos' }" type="button" @click="section = 'videos'">Видео</button>
      </div>

      <SnapshotRow
        v-if="section === 'best'"
        kind="media"
        :title="bestArtist.title"
        subtitle="Исполнитель"
        :source="bestArtist.source_type"
        round
        :liked="bestArtist.is_favorite"
        @open="openArtist"
        @menu="openSnapshotMenu($event, bestArtist, 'my-artists')"
      />

      <template v-else-if="section === 'tracks'">
        <SnapshotRow
          v-for="track in trackResults"
          :key="track.source_id"
          :title="track.title"
          :subtitle="artistsLine(track.artists)"
          :source="track.source_type"
          :liked="track.is_favorite"
          :downloaded="downloads.isDownloaded(track)"
          :playing="isPlaying(track)"
          @open="player.playSnapshot(track)"
          @menu="openSnapshotMenu($event, track, 'my-tracks')"
        />
      </template>

      <SnapshotRow
        v-else-if="section === 'videos'"
        kind="video"
        :title="videoResult.title"
        :subtitle="`${artistsLine(videoResult.artists)} · клип`"
        :source="videoResult.source_type"
        :cover="videoResult.cover_url ?? ''"
        :liked="videoResult.is_favorite"
        :playing="isPlaying(videoResult)"
        @open="player.playSnapshot(videoResult)"
        @menu="openSnapshotMenu($event, videoResult, 'my-videos')"
      />

      <div v-else class="empty" style="padding-top:20px">
        <div class="et">Пока пусто в этой пилюле</div>
        <div class="es">Фикстуры есть у Лучшего, треков и видео</div>
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

<script src="./Search.ts" lang="ts"></script>
