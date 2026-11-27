<template>
  <div>
    <AppBar title="Поиск" badge />
    <div class="src-rail">
      <button
        v-for="item in resources"
        :key="item.id"
        type="button"
        class="src-ico"
        :class="{ on: resource === item.id }"
        :aria-pressed="resource === item.id"
        @click="selectResource(item.id)"
      >
        <span class="bubble"><SourceBadge :source="item.id" :caption="item.label" /></span>
        <span class="nm">{{ item.label }}</span>
      </button>
    </div>
    <div class="chip-scroll sec-row">
      <button
        v-for="pill in pills"
        :key="pill.id"
        type="button"
        class="chip"
        :class="{ active: section === pill.id }"
        @click="selectSection(pill.id)"
      >
        {{ pill.label }}
      </button>
    </div>
    <div class="field" :class="{ 'is-focus': focused }">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M16.5 16.5 21 21" />
      </svg>
      <input
        ref="inputEl"
        v-model="query"
        :placeholder="placeholder"
        maxlength="500"
        @focus="focused = true"
        @blur="focused = false"
      >
      <button
        v-if="hasQuery"
        class="field-clear"
        type="button"
        aria-label="очистить поиск"
        @click="clearQuery"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
        </svg>
      </button>
    </div>

    <template v-if="!hasQuery">
      <div v-if="history.length" class="sec-label">
        Недавние
        <button class="hist-clear" type="button" @click="clearHistory">очистить</button>
      </div>
      <div v-if="history.length" class="hist">
        <button v-for="item in history" :key="item" class="chip" type="button" @click="useHistory(item)">
          {{ item }}
        </button>
      </div>
      <div class="empty" style="padding-top:28px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M16.5 16.5 21 21" />
        </svg>
        <div class="et">{{ emptyTitle }}</div>
        <div class="es">Источник и секция уже выбраны. История только на устройстве.</div>
      </div>
    </template>

    <template v-else>
      <div v-if="loading && !result" class="loading-line">
        <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <circle cx="12" cy="12" r="8" opacity=".25" />
          <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
        </svg>
      </div>

      <div v-else-if="error && !result" class="empty" style="padding-top:28px">
        <div class="et">{{ error }}</div>
        <button class="btn btn-primary" type="button" style="margin-top:12px" @click="retry">Повторить</button>
      </div>

      <template v-else-if="result">
        <SnapshotRow
          v-if="section === 'best' && best"
          :kind="best.type === 'video' ? 'video' : best.type === 'track' ? 'track' : 'media'"
          :title="bestTitle"
          :subtitle="bestSubtitle"
          :entity-type="best.type"
          :source="best.source_type"
          :source-id="best.source_id"
          :cover="bestCover"
          :round="best.type === 'artist'"
          :liked="best.is_favorite"
          :playing="isPlaying(best)"
          :duration-ms="best.type === 'track' || best.type === 'video' ? best.duration_ms : null"
          @open="openResult(best, { playbackSource: playSourceSearch, contextItems: trackResults, contextRef })"
          @menu="openSnapshotMenu($event, best, snapshotMenuContext(best))"
        />

        <template v-else-if="section === 'tracks'">
          <SnapshotRow
            v-for="track in trackResults"
            :key="`${track.source_type}:${track.source_id}`"
            :title="track.title"
            :subtitle="artistsLine(track.artists)"
            :source="track.source_type"
            :source-id="track.source_id"
            :cover="trackCover(track)"
            :liked="track.is_favorite"
            :downloaded="downloads.isDownloaded(track)"
            :playing="isPlaying(track)"
            :duration-ms="track.duration_ms"
            @open="openResult(track, { playbackSource: playSourceSearch, contextItems: trackResults, contextRef })"
            @menu="openSnapshotMenu($event, track, 'my-tracks')"
          />
        </template>

        <template v-else-if="section === 'albums'">
          <SnapshotRow
            v-for="album in albumResults"
            :key="`${album.source_type}:${album.source_id}`"
            kind="media"
            :title="album.title"
            :subtitle="albumLine(album)"
            entity-type="album"
            :source="album.source_type"
            :source-id="album.source_id"
            :cover="resolveUrl(album.cover_url)"
            :liked="album.is_favorite"
            @open="openResult(album)"
            @menu="openSnapshotMenu($event, album, 'my-albums')"
          />
        </template>

        <template v-else-if="section === 'artists'">
          <SnapshotRow
            v-for="artist in artistResults"
            :key="`${artist.source_type}:${artist.source_id}`"
            kind="media"
            :title="artist.title"
            subtitle="Исполнитель"
            entity-type="artist"
            :source="artist.source_type"
            :source-id="artist.source_id"
            :cover="resolveUrl(artist.cover_url)"
            round
            :liked="artist.is_favorite"
            @open="openResult(artist)"
            @menu="openSnapshotMenu($event, artist, 'my-artists')"
          />
        </template>

        <template v-else-if="section === 'playlists'">
          <SnapshotRow
            v-for="playlist in playlistResults"
            :key="`${playlist.source_type}:${playlist.source_id}`"
            kind="media"
            :title="playlist.title"
            :subtitle="playlist.owner_name ?? 'Плейлист'"
            entity-type="playlist"
            :source="playlist.source_type"
            :source-id="playlist.source_id"
            :cover="resolveUrl(playlist.cover_url)"
            :liked="playlist.is_favorite"
            @open="openResult(playlist)"
            @menu="openSnapshotMenu($event, playlist, 'my-playlists')"
          />
        </template>

        <template v-else-if="section === 'videos'">
          <SnapshotRow
            v-for="video in videoResults"
            :key="`${video.source_type}:${video.source_id}`"
            kind="video"
            :title="video.title"
            :subtitle="`${artistsLine(video.artists)} · клип`"
            entity-type="video"
            :source="video.source_type"
            :source-id="video.source_id"
            :cover="resolveUrl(video.cover_url)"
            :liked="video.is_favorite"
            :playing="isPlaying(video)"
            :duration-ms="video.duration_ms"
            @open="openResult(video, { playbackSource: playSourceSearch, contextItems: videoResults, contextRef })"
            @menu="openSnapshotMenu($event, video, 'my-videos')"
          />
        </template>

        <div
          v-if="section !== 'best' && sectionItems.length === 0"
          class="empty"
          style="padding-top:20px"
        >
          <div class="et">Ничего не найдено</div>
          <div class="es">По запросу «{{ result.query }}» в этой пилюле пусто</div>
        </div>
        <div v-else-if="section === 'best' && !best" class="empty" style="padding-top:20px">
          <div class="et">Лучшего совпадения нет</div>
          <div class="es">Загляните в другие пилюли</div>
        </div>

        <div v-if="loadingMore" class="loading-line">
          <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <circle cx="12" cy="12" r="8" opacity=".25" />
            <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
          </svg>
        </div>
        <div v-else-if="sectionHasMore" ref="sentinel" class="more-sentinel" aria-hidden="true" />
        <div v-if="error && result" class="empty" style="padding-top:12px">
          <div class="et">{{ error }}</div>
          <button class="btn btn-secondary" type="button" style="margin-top:10px" @click="retry">Повторить</button>
        </div>
      </template>

      <div v-else-if="q.length < SEARCH_MIN_LENGTH" class="empty" style="padding-top:28px">
        <div class="et">Введите минимум {{ SEARCH_MIN_LENGTH }} символа</div>
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

<script src="./SearchV2.ts" lang="ts"></script>

<style scoped src="./SearchV2.css"></style>
