<template>
  <div>
    <AppBar back />

    <div v-if="loading && !profile" class="loading-line">
      <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <circle cx="12" cy="12" r="8" opacity=".25" />
        <path d="M12 4a8 8 0 0 1 8 8" stroke-linecap="round" />
      </svg>
    </div>
    <div v-else-if="loadError && !profile" class="empty" style="padding-top:28px">
      <div class="et">{{ loadError }}</div>
    </div>

    <template v-else>
      <div class="f-head">
        <div class="avatar ini lg" :class="friendTone(userId)">
          <img v-if="profile?.avatar_url" :src="profile.avatar_url" alt="">
          <template v-else-if="profile">{{ friendInitial(profile.name) }}</template>
        </div>
        <div class="f-name">{{ profile?.name ?? '' }}</div>
        <div class="f-mail">{{ profile?.email }}</div>
        <div style="margin-top:10px">
          <button class="btn btn-danger sm" type="button" @click="askRemoveFriend">Удалить из друзей</button>
        </div>
      </div>

      <div :class="snapshot ? (watching ? 'now-card is-vid' : 'now-card') : 'q-stand'">
        <template v-if="snapshot && watching">
          <div class="preview">
            <img
              v-if="snapshot.type === 'video'"
              :src="snapshot.cover_url ?? ''"
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
              <div class="track-title">{{ snapshot.title }}</div>
              <div class="track-artist">{{ artistsLine(snapshot.artists) }}</div>
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
        <template v-else-if="snapshot">
          <div class="thumb" :style="{ background: coverVar(snapshot.source_type) }">
            <img v-if="snapshot.type === 'track'" :src="trackCover(snapshot)" alt="">
            <SourceBadge :source="snapshot.source_type" />
          </div>
          <div class="track-meta">
            <div class="track-title">{{ snapshot.title }}</div>
            <div class="track-artist">{{ artistsLine(snapshot.artists) }}</div>
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
          <p v-if="queueLoaded && !queueRows.length" class="q-empty">Очередь пуста</p>
          <SnapshotRow
            v-for="({ item, snapshot: row }, index) in queueRows"
            :key="item.id"
            :kind="queueRowKind(row)"
            :title="row.title"
            :subtitle="artistsLine(row.artists)"
            :source="row.source_type"
            :cover="queueRowCover(row)"
            :round="row.type === 'artist'"
            :playing="isPlaying(row)"
            sortable
            :dragging="sortDrag?.from === index"
            :drag-style="sortRowStyle(index, sortDrag)"
            @open="player.playSnapshot(row)"
            @menu="openSnapshotMenu($event, row, queueMenuContext(row))"
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
          :playing="isPlaying(track)"
          @open="player.playSnapshot(track)"
          @menu="openSnapshotMenu($event, track, 'my-tracks')"
        />
        <div v-if="!favoriteTracks.length" class="empty" style="padding-top:16px">
          <div class="et">Треков нет</div>
        </div>
      </template>
      <template v-else-if="favTab === 'playlists'">
        <SnapshotRow
          v-for="pl in playlists"
          :key="pl.source_id"
          kind="media"
          :title="pl.title"
          :subtitle="pl.owner_name ?? 'Плейлист'"
          :source="pl.source_type"
          :cover="pl.cover_url ?? ''"
          @open="openPlaylist(pl)"
          @menu="openSnapshotMenu($event, pl, 'my-playlists', pl.owner_name ?? undefined)"
        />
        <div v-if="!playlists.length" class="empty" style="padding-top:16px">
          <div class="et">Плейлистов нет</div>
        </div>
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
          @open="openArtist(artist)"
          @menu="openSnapshotMenu($event, artist, 'my-artists')"
        />
        <div v-if="!artists.length" class="empty" style="padding-top:16px">
          <div class="et">Артистов нет</div>
        </div>
      </template>
      <template v-else>
        <SnapshotRow
          v-for="album in albums"
          :key="album.source_id"
          kind="media"
          :title="album.title"
          :subtitle="artistsLine(album.artists) || 'Альбом'"
          :source="album.source_type"
          :cover="album.cover_url ?? ''"
          @open="openAlbum(album)"
          @menu="openSnapshotMenu($event, album, 'my-albums')"
        />
        <div v-if="!albums.length" class="empty" style="padding-top:16px">
          <div class="et">Альбомов нет</div>
        </div>
      </template>
    </template>

    <AppConfirm
      :open="confirmOpen"
      title="Удалить из друзей?"
      message="Вы перестанете быть друзьями."
      confirm-label="Удалить"
      @confirm="removeFriend"
      @close="confirmOpen = false"
    />

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
