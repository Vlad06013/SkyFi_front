import type {
  AlbumSnapshot,
  AnySnapshot,
  ArtistSnapshot,
  PlaylistSnapshot,
  TrackSnapshot,
  VideoSnapshot,
} from '@/types';
import clipFrameUrl from '../../design/shared/clip-frame.jpg';

export const trackRadio: TrackSnapshot = {
  type: 'track',
  source_type: 'yandex_music',
  source_id: '111',
  title: 'Радиотишина',
  duration_ms: 203310,
  cover_url: null,
  artists: [{ name: 'Sum 41', source_id: '5950' }],
  album: { title: 'Heaven :x: Hell', year: '2024' },
  stream_url: null,
};

export const trackSea: TrackSnapshot = {
  type: 'track',
  source_type: 'vk',
  source_id: 'vk-9',
  title: 'Морская',
  duration_ms: 240000,
  cover_url: null,
  artists: [{ name: 'Мумий Тролль' }],
  album: { title: 'Морская', year: '1997' },
  stream_url: null,
};

export const trackFatLip: TrackSnapshot = {
  type: 'track',
  source_type: 'yandex_music',
  source_id: '222',
  title: 'Fat Lip',
  duration_ms: 178000,
  cover_url: null,
  artists: [{ name: 'Sum 41' }],
  album: { title: 'All Killer No Filler', year: '2001' },
  stream_url: null,
};

export const artistShinedown: ArtistSnapshot = {
  type: 'artist',
  source_type: 'yandex_music',
  source_id: '44137',
  title: 'Shinedown',
  artists: [{ name: 'Shinedown', source_id: '44137' }],
  cover_url: 'https://avatars.yandex.net/get-music-content/114728/42e47612.p.44137/200x200',
};

export const albumMixtape: AlbumSnapshot = {
  type: 'album',
  source_type: 'yandex_music',
  source_id: '6837444',
  title: 'Mixtape',
  artists: [{ name: 'Emil Bulls', source_id: '172580' }],
  year: '2019',
  cover_url: 'https://avatars.yandex.net/get-music-content/192707/5691330e.a.6837444-1/200x200',
  track_count: 14,
};

export const playlistRoad: PlaylistSnapshot = {
  type: 'playlist',
  source_type: 'skyfi',
  source_id: 'pl-road',
  title: 'В дорогу',
  artists: [],
  owner_name: 'Влад',
  cover_url: null,
  item_count: 18,
};

export const playlistPunk: PlaylistSnapshot = {
  type: 'playlist',
  source_type: 'yandex_music',
  source_id: 'pl-punk',
  title: 'Панк на ночь',
  artists: [],
  owner_name: 'Яндекс',
  cover_url: null,
  item_count: 36,
};

export const playlistWinter: PlaylistSnapshot = {
  type: 'playlist',
  source_type: 'yandex_music',
  source_id: '139954184:1863',
  title: 'Зимняя романтика',
  artists: [],
  owner_name: 'Музыкальная редакция',
  cover_url: 'https://avatars.yandex.net/get-music-user-playlist/11360783/139954184.1863.72835/200x200?1766992172835',
  item_count: 287,
};

export const mockVideo: VideoSnapshot = {
  type: 'video',
  source_type: 'mock',
  source_id: 'mock-big-buck-bunny',
  title: 'Радиотишина',
  artists: [{ name: 'Sum 41' }],
  duration_ms: 10000,
  cover_url: clipFrameUrl,
  watch_url: 'https://test-videos.co.uk/',
};

export const mockVideoJellyfish: VideoSnapshot = {
  type: 'video',
  source_type: 'mock',
  source_id: 'mock-jellyfish',
  title: 'Морская',
  artists: [{ name: 'Мумий Тролль' }],
  duration_ms: 30000,
  cover_url: clipFrameUrl,
  watch_url: 'https://test-videos.co.uk/',
};

export const favoriteTracks: TrackSnapshot[] = [trackRadio, trackSea, trackFatLip];

export const downloadedTracks: TrackSnapshot[] = [trackRadio, trackFatLip];

/** Контент «В дорогу»: треки + один клип, чтобы проверить смешанный список. */
export const playlistRoadContent: AnySnapshot[] = [trackRadio, mockVideo, trackSea, trackFatLip];

export const favoriteAlbums: AlbumSnapshot[] = [albumMixtape];
export const favoriteArtists: ArtistSnapshot[] = [artistShinedown];
export const favoritePlaylists: PlaylistSnapshot[] = [playlistWinter, playlistRoad, playlistPunk];
export const favoriteVideos: VideoSnapshot[] = [mockVideo, mockVideoJellyfish];
