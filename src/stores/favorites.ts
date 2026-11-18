import { defineStore } from 'pinia';
import { computed, ref, type Ref } from 'vue';
import {
  favoriteAlbums,
  favoriteArtists,
  favoritePlaylists,
  favoriteTracks,
  favoriteVideos,
} from '@/mocks/catalog';
import type {
  AlbumSnapshot,
  AnySnapshot,
  ArtistSnapshot,
  PlaylistSnapshot,
  TrackSnapshot,
  VideoSnapshot,
} from '@/types';

function sameIdentity(a: AnySnapshot, b: AnySnapshot) {
  return a.type === b.type && a.source_type === b.source_type && a.source_id === b.source_id;
}

export const useFavoritesStore = defineStore('favorites', () => {
  const sections: Record<AnySnapshot['type'], Ref<AnySnapshot[]>> = {
    track: ref([...favoriteTracks]),
    video: ref([...favoriteVideos]),
    album: ref([...favoriteAlbums]),
    artist: ref([...favoriteArtists]),
    playlist: ref([...favoritePlaylists]),
  };

  const tracks = computed(() => sections.track.value as TrackSnapshot[]);
  const videos = computed(() => sections.video.value as VideoSnapshot[]);
  const albums = computed(() => sections.album.value as AlbumSnapshot[]);
  const artists = computed(() => sections.artist.value as ArtistSnapshot[]);
  const playlists = computed(() => sections.playlist.value as PlaylistSnapshot[]);

  function has(snapshot: AnySnapshot | null | undefined) {
    if (!snapshot) return false;
    return sections[snapshot.type].value.some((item) => sameIdentity(item, snapshot));
  }

  function add(snapshot: AnySnapshot) {
    const section = sections[snapshot.type];
    if (section.value.some((item) => sameIdentity(item, snapshot))) return;
    section.value = [...section.value, snapshot];
  }

  function remove(snapshot: AnySnapshot) {
    const section = sections[snapshot.type];
    section.value = section.value.filter((item) => !sameIdentity(item, snapshot));
  }

  function toggle(snapshot: AnySnapshot) {
    if (has(snapshot)) {
      remove(snapshot);
      return false;
    }
    add(snapshot);
    return true;
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const section = sections.track;
    const next = [...section.value];
    if (from < 0 || to < 0 || from >= next.length || to >= next.length) return;
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    section.value = next;
  }

  return { tracks, videos, albums, artists, playlists, has, add, remove, toggle, reorder };
});
