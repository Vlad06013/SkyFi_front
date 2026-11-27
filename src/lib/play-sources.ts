import type { PlaySource } from '@/types';

/**
 * Статичные playback_source по экранам: страница
 * берёт свою константу вместо литерала. Значения — строгий enum
 * PlaySource (api.md §5).
 */
export const PLAY_SOURCE_FAVORITES: PlaySource = 'favorites';
export const PLAY_SOURCE_SEARCH: PlaySource = 'search';
export const PLAY_SOURCE_PLAYLIST: PlaySource = 'playlist';
export const PLAY_SOURCE_UPLOADS: PlaySource = 'uploads';
export const PLAY_SOURCE_QUEUE: PlaySource = 'queue';
export const PLAY_SOURCE_SINGLE: PlaySource = 'single';

/** У альбома и артиста своего значения в enum нет (api.md §5) —
 *  их экраны стартуют трек как 'single' с контекстом списка страницы. */
export const PLAY_SOURCE_ALBUM: PlaySource = 'single';
export const PLAY_SOURCE_ARTIST: PlaySource = 'single';
