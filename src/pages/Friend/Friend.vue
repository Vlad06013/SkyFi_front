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

    <div :class="friend.current_snapshot ? (watching ? 'now-card is-vid' : 'now-card') : 'q-stand'">
      <template v-if="friend.current_snapshot && watching">
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
      </template>
      <template v-else-if="friend.current_snapshot">
        <div class="thumb" :style="{ background: coverVar(friend.current_snapshot.source_type) }">
          <img v-if="friend.current_snapshot.type === 'track'" :src="trackCover(friend.current_snapshot)" alt="">
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
      </template>

      <button class="q-toggle" :class="{ 'is-open': queueOpen }" type="button" @click="toggleQueue">
        <span class="lbl">Очередь
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9.5 6 6 6-6" />
          </svg>
        </span>
      </button>
      <div v-if="queueOpen" class="q-body list-sort" :class="{ 'is-sorting': Boolean(sortDrag) }">
        <p v-if="!queue.length" class="q-empty">Очередь пуста</p>
        <SnapshotRow
          v-for="(track, index) in queue"
          :key="track.source_id"
          :title="track.title"
          :subtitle="artistsLine(track.artists)"
          :source="track.source_type"
          :cover="trackCover(track)"
          :liked="favorites.has(track)"
          :playing="isPlaying(track)"
          sortable
          :dragging="sortDrag?.from === index"
          :drag-style="sortRowStyle(index, sortDrag)"
          @open="player.playSnapshot(track)"
          @menu="openSnapshotMenu($event, track, 'friend-queue-track')"
          @sort="onSort($event, index)"
        />
      </div>
    </div>

    <div class="sec-label">Избранное</div>
    <div class="chip-scroll">
      <button
        v-for="chip in favChips"
        :key="chip.id"
        class="chip"
        :class="{ active: favTab === chip.id }"
        type="button"
        @click="favTab = chip.id"
      >
        {{ chip.label }}
      </button>
    </div>

    <template v-if="favTab === 'tracks'">
      <SnapshotRow
        v-for="track in favoriteTracks"
        :key="track.source_id"
        :title="track.title"
        :subtitle="artistsLine(track.artists)"
        :source="track.source_type"
        :cover="trackCover(track)"
        :liked="favorites.has(track)"
        :playing="isPlaying(track)"
        @open="player.playSnapshot(track)"
        @menu="openSnapshotMenu($event, track, 'my-tracks')"
      />
    </template>
    <template v-else-if="favTab === 'playlists'">
      <SnapshotRow
        v-for="pl in playlists"
        :key="pl.source_id"
        kind="media"
        :title="pl.title"
        :subtitle="`${pl.item_count} · ${pl.owner_name}`"
        :source="pl.source_type"
        :cover="pl.cover_url ?? ''"
        :liked="favorites.has(pl)"
        @open="player.playSnapshot(favoriteTracks[0])"
        @menu="openSnapshotMenu($event, pl, 'my-playlists', pl.owner_name ?? undefined)"
      />
    </template>
    <template v-else-if="favTab === 'artists'">
      <SnapshotRow
        v-for="artist in artists"
        :key="artist.source_id"
        kind="media"
        :title="artist.title"
        subtitle="Исполнитель"
        :source="artist.source_type"
        :cover="artist.cover_url ?? ''"
        round
        :liked="favorites.has(artist)"
        @open="openArtist(artist.source_id)"
        @menu="openSnapshotMenu($event, artist, 'my-artists')"
      />
    </template>
    <template v-else>
      <SnapshotRow
        v-for="album in albums"
        :key="album.source_id"
        kind="media"
        :title="album.title"
        :subtitle="`${artistsLine(album.artists)} · ${album.year}`"
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

<script src="./Friend.ts" lang="ts"></script>

<style scoped src="./Friend.css"></style>
