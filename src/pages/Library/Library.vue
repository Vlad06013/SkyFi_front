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

    <div v-if="showDownloadAll" class="dl-all-bar">
      <span class="dl-count">{{ counts[tab] }}</span>
      <button v-if="tab === 'playlists'" class="dl-all is-run" type="button" aria-label="скачивается 42%">
        <svg class="ring spin" viewBox="0 0 36 36" aria-hidden="true">
          <circle class="track" cx="18" cy="18" r="15" />
          <circle class="arc" cx="18" cy="18" r="15" transform="rotate(-90 18 18)" />
        </svg>
        <span class="pct">42%</span>
      </button>
      <span v-else-if="tab === 'albums'" class="dl-all is-done">Скачано</span>
      <button v-else class="dl-all" type="button" aria-label="скачать все">
        <svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" /></svg>
        <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5v12m0 0 4.6-4.6M12 17l-4.6-4.6" />
        </svg>
      </button>
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
      <div class="pl-row">
        <div class="pl-new">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
        <div class="track-meta">
          <div class="track-title">Новый плейлист</div>
          <div class="track-artist">имя и видимость</div>
        </div>
      </div>
      <MediaRow
        v-for="pl in playlists"
        :key="pl.source_id"
        :title="pl.title"
        :subtitle="`${pl.item_count} · ${pl.owner_name}`"
        :source="pl.source_type"
        @open="openPlaylist(pl.source_id)"
        @menu="openSnapshotMenu($event, pl, pl.source_type === 'skyfi' ? 'own-playlist' : 'collection', pl.owner_name ?? undefined)"
      />
    </template>

    <template v-else-if="tab === 'albums'">
      <MediaRow
        v-for="album in favoriteAlbums"
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
        v-for="artist in favoriteArtists"
        :key="artist.source_id"
        :title="artist.title"
        subtitle="Исполнитель"
        :source="artist.source_type"
        round
        @open="openArtist(artist.source_id)"
        @menu="openSnapshotMenu($event, artist, 'collection')"
      />
    </template>

    <div v-else class="empty" style="padding-top:28px">
      <div class="et">{{ tab === 'uploads' ? 'Свои файлы' : 'Скачано' }}</div>
      <div class="es">{{ tab === 'uploads' ? 'Загрузки появятся здесь' : 'Офлайн целиком — плейлисты, альбомы, треки' }}</div>
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import AppBar from '@/components/AppBar/AppBar.vue';
import MediaOverlays from '@/components/MediaOverlays/MediaOverlays.vue';
import MediaRow from '@/components/MediaRow/MediaRow.vue';
import TrackRow from '@/components/TrackRow/TrackRow.vue';
import { useMediaMenu } from '@/composables/useMediaMenu';
import { moveItem, sortRowStyle, startListSort, type ListSortState } from '@/lib/list-sort';
import { artistsLine } from '@/lib/cover';
import {
  favoriteAlbums,
  favoriteArtists,
  favoritePlaylists,
  favoriteTracks,
  trackFatLip,
  trackRadio,
} from '@/mocks/catalog';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type { TrackSnapshot } from '@/types';
import type { MenuEntity } from '@/lib/media-menu';

type LibTab = 'tracks' | 'playlists' | 'albums' | 'artists' | 'uploads' | 'downloaded';

const chips: { id: LibTab; label: string }[] = [
  { id: 'tracks', label: 'Треки' },
  { id: 'playlists', label: 'Плейлисты' },
  { id: 'albums', label: 'Альбомы' },
  { id: 'artists', label: 'Артисты' },
  { id: 'uploads', label: 'Загрузки' },
  { id: 'downloaded', label: 'Скачано' },
];

const tab = ref<LibTab>('tracks');
const router = useRouter();
const player = usePlayerStore();
const { current } = storeToRefs(player);
const toast = useToastStore();
const tracks = ref([...favoriteTracks]);
const playlists = ref([...favoritePlaylists]);
const sortDrag = ref<ListSortState | null>(null);

const { open, variant, top, right, sheet, entity, openSnapshotMenu, closeMenu, run } = useMediaMenu({
  onListen: (item) => listenCollection(item),
  onEdit: (item) => toast.show(item.title, 'изменение плейлиста'),
  onDelete: (item) => {
    playlists.value = playlists.value.filter((pl) => pl.source_id !== item.sourceId);
    toast.show(item.title, 'плейлист удалён');
  },
});

const counts: Record<LibTab, string> = {
  tracks: '128 треков',
  playlists: '6 плейлистов',
  albums: '24 альбома',
  artists: '18 артистов',
  uploads: '',
  downloaded: '',
};

const showDownloadAll = computed(
  () => tab.value === 'tracks' || tab.value === 'playlists' || tab.value === 'albums' || tab.value === 'artists',
);

function isPlaying(track: TrackSnapshot) {
  const snap = current.value;
  return snap?.type === 'track' && snap.source_id === track.source_id;
}

function isOffline(track: TrackSnapshot) {
  return track.source_id === trackFatLip.source_id;
}

function isDownloaded(track: TrackSnapshot) {
  return track.source_id === trackRadio.source_id || track.source_type === 'upload';
}

function listenCollection(item: MenuEntity) {
  if (item.snapshot?.type === 'playlist') openPlaylist(item.sourceId);
  else if (item.snapshot?.type === 'album') openAlbum(item.sourceId);
  else if (item.snapshot?.type === 'artist') openArtist(item.sourceId);
  player.playSnapshot(tracks.value[0] ?? favoriteTracks[0]);
}

function onSort(event: PointerEvent, index: number) {
  const container = (event.currentTarget as HTMLElement).closest('.list-sort');
  if (!(container instanceof HTMLElement)) return;
  startListSort(event, index, {
    container,
    onMove: (state) => {
      sortDrag.value = state;
    },
    onEnd: (from, to) => {
      sortDrag.value = null;
      tracks.value = moveItem(tracks.value, from, to);
    },
  });
}

function openPlaylist(id: string) {
  router.push(`/playlist/${id}`);
}

function openAlbum(id: string) {
  router.push(`/album/${id}`);
}

function openArtist(id: string) {
  router.push(`/artist/${id}`);
}
</script>
