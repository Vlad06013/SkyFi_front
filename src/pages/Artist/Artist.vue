<template>
  <div>
    <AppBar back />
    <div class="hero-cover round" :style="{ background: coverVar(artist.source_type) }">
      <SourceBadge :source="artist.source_type" />
    </div>
    <div class="hero-name">{{ artist.title }}</div>
    <div class="hero-sub">Исполнитель</div>
    <div class="hero-actions">
      <button class="fab small" type="button" aria-label="играть" @click="player.playSnapshot(favoriteTracks[0])">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
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
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import SourceBadge from '@/components/SourceBadge/SourceBadge.vue';
import TrackRow from '@/components/TrackRow/TrackRow.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { coverVar, artistsLine } from '@/lib/cover';
import { artistSum41, favoriteTracks } from '@/mocks/catalog';
import { usePlayerStore } from '@/stores/player';

const player = usePlayerStore();
const artist = artistSum41;
const { open, variant, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu();
</script>
