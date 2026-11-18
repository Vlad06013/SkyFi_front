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

      <MediaRow
        v-if="section === 'best'"
        :title="artistSum41.title"
        subtitle="Исполнитель"
        :source="artistSum41.source_type"
        round
        @open="openArtist"
        @menu="openSnapshotMenu($event, artistSum41, 'collection')"
      >
        <svg class="like-mark" viewBox="0 0 24 24" fill="currentColor" aria-label="в избранном">
          <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
        </svg>
      </MediaRow>

      <template v-else-if="section === 'tracks'">
        <TrackRow
          v-for="track in favoriteTracks"
          :key="track.source_id"
          :title="track.title"
          :artist="artistsLine(track.artists)"
          :source="track.source_type"
          @play="player.playSnapshot(track)"
          @menu="openSnapshotMenu($event, track, 'track')"
        />
      </template>

      <MediaRow
        v-else-if="section === 'videos'"
        :title="mockVideo.title"
        :subtitle="`${artistsLine(mockVideo.artists)} · клип`"
        :source="mockVideo.source_type"
        :menuable="false"
        @open="player.playSnapshot(mockVideo)"
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
      :variant="variant"
      :sheet="sheet"
      :entity="entity"
      @close="closeMenu"
      @action="run"
      @update:sheet="sheet = $event"
    />
  </div>
</template>

<script src="./Search.ts" lang="ts"></script>
