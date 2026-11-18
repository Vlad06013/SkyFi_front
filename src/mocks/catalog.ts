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
  artists: [{ name: 'Sum 41', source_id: '5950' }],
  album: { title: 'Heaven :x: Hell', year: '2024' },
  stream_url: null,
};

export const trackColonel: TrackSnapshot = {
  type: 'track',
  source_type: 'upload',
  source_id: 'up-1',
  title: 'Полковнику никто не пишет',
  duration_ms: 312000,
  artists: [{ name: 'Би-2' }],
  album: { title: 'Мяу кисс ми' },
  stream_url: '/local/colonel.mp3',
};

export const trackSea: TrackSnapshot = {
  type: 'track',
  source_type: 'vk',
  source_id: 'vk-9',
  title: 'Морская',
  duration_ms: 240000,
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
  artists: [{ name: 'Sum 41' }],
  album: { title: 'All Killer No Filler', year: '2001' },
  stream_url: null,
};

export const artistSum41: ArtistSnapshot = {
  type: 'artist',
  source_type: 'yandex_music',
  source_id: '5950',
  title: 'Sum 41',
  artists: [{ name: 'Sum 41', source_id: '5950' }],
  cover_url: null,
};

export const albumHeaven: AlbumSnapshot = {
  type: 'album',
  source_type: 'yandex_music',
  source_id: 'alb-1',
  title: 'Heaven :x: Hell',
  artists: [{ name: 'Sum 41', source_id: '5950' }],
  year: '2024',
  cover_url: null,
  track_count: 20,
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

export const favoriteTracks: TrackSnapshot[] = [
  trackRadio,
  trackColonel,
  trackSea,
  trackFatLip,
];

export const trackOwnDemo: TrackSnapshot = {
  type: 'track',
  source_type: 'upload',
  source_id: 'up-2',
  title: 'Демо на диване',
  duration_ms: 187000,
  artists: [{ name: 'Я' }],
  album: null,
  stream_url: '/local/demo.mp3',
};

export const uploadedTracks: TrackSnapshot[] = [trackColonel, trackOwnDemo];

export const downloadedTracks: TrackSnapshot[] = [trackRadio, trackColonel, trackFatLip];

/** Контент «В дорогу»: треки + один клип, чтобы проверить смешанный список. */
export const playlistRoadContent: AnySnapshot[] = [
  trackRadio,
  trackColonel,
  mockVideo,
  trackSea,
  trackFatLip,
];

export const favoriteAlbums: AlbumSnapshot[] = [albumHeaven];
export const favoriteArtists: ArtistSnapshot[] = [artistSum41];
export const favoritePlaylists: PlaylistSnapshot[] = [playlistRoad, playlistPunk];
export const favoriteVideos: VideoSnapshot[] = [mockVideo, mockVideoJellyfish];
