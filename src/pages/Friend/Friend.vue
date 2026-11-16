<template>
  <div>
    <AppBar back />
    <div class="f-head">
      <div class="avatar ini lg" :class="friend.tone">{{ friend.initial }}</div>
      <div class="f-name">{{ friend.name }}</div>
      <div class="f-mail">{{ friend.email }}</div>
    </div>
    <div v-if="friend.current_snapshot" class="now-card">
      <div class="thumb" :style="{ background: coverVar(friend.current_snapshot.source_type) }">
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
    </div>
    <div class="sec-label">Избранное</div>
    <TrackRow
      v-for="track in favoriteTracks"
      :key="track.source_id"
      :title="track.title"
      :artist="artistsLine(track.artists)"
      :source="track.source_type"
      @play="player.playSnapshot(track)"
      @menu="openSnapshotMenu($event, track, 'track')"
    />
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

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import TrackRow from '@/components/TrackRow/TrackRow.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { mockFriends } from '@/mocks/friends';
import { favoriteTracks } from '@/mocks/catalog';
import { coverVar, artistsLine } from '@/lib/cover';
import { usePlayerStore } from '@/stores/player';

const route = useRoute();
const player = usePlayerStore();
const { open, variant, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu();
const friend = computed(
  () => mockFriends.find((f) => String(f.id) === String(route.params.id)) ?? mockFriends[0],
);

function playNow() {
  const snapshot = friend.value.current_snapshot;
  if (snapshot) player.playSnapshot(snapshot);
}
</script>
