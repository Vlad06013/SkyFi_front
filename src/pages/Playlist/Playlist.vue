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
      <button class="fab small" type="button" aria-label="играть" @click="player.playSnapshot(favoriteTracks[0])">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
      </button>
      <button class="icon-btn liked" type="button" aria-label="в избранном">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 20s-7-4.3-9-9c-1.2-2.8.6-6 3.8-6C9 5 12 8 12 8s3-3 5.2-3C20.4 5 22.2 8.2 21 11c-2 4.7-9 9-9 9z" />
        </svg>
      </button>
    </div>
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
import { coverVar, artistsLine } from '@/lib/cover';
import { favoritePlaylists, favoriteTracks, playlistRoad } from '@/mocks/catalog';
import { usePlayerStore } from '@/stores/player';

const route = useRoute();
const player = usePlayerStore();
const { open, variant, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu();

const playlist = computed(
  () => favoritePlaylists.find((p) => p.source_id === route.params.id) ?? playlistRoad,
);

const own = computed(() => playlist.value.source_type === 'skyfi');
</script>
