
export type TrackType = {
    id: string | number;
    title: string;
    artist?: string;
    artists?: Array<{ name: string }>;
    cover?: string;
    symbol?: string;
};

export interface TrackArtistMeta {
    id: string | null;
    name: string;
}

export interface TrackAlbumMeta {
    id: string | null;
    title: string;
    release_year: string | null;
    cover_path: string | null;
}

export interface TrackMeta {
    album: TrackAlbumMeta | null;
    artists: TrackArtistMeta[];
}

export interface Track {
    id: number | string;
    title: string;
    source_type: string;
    source_id: string | null;
    duration: number | null;
    // url: string | null;
    // has_audio_url: boolean;
    meta: TrackMeta;
    file: TrackFile | null;
}

export interface TrackFile {
    id: number;
    track_id: number;
    disk: string;
    path: string;
    mime_type: string;
    size_bytes: number | null;
    duration_ms: number | null;
    sha256: string | null;
    created_at: string;
    updated_at: string;
}
// export interface Track {
//     /** Внутренний ID трека в SkyFi или внешний ID, если трек ещё не сохранён. */
//     id: number | string;
//     title: string;
//     description?: string | null;
//     /** Внутренний ID пользователя, загрузившего трек. */
//     uploaded_by?: number | null;
//     /** Источник трека. */
//     source_type: TrackSourceType;
//     /** ID трека в исходном каталоге. */
//     source_id: string | null;
//     /** Длительность трека в миллисекундах. */
//     duration: number | null;
//     /** URL воспроизведения, если уже получен. */
//     url: string | null;
//     meta: TrackMeta;
//     /** Внутренний ID альбома в SkyFi, если есть. */
//     album_id?: number | null;
//     is_favorite?: boolean;
//     status?: string;
//     /** Локальный файл */
//     file?: TrackFile | null;
//     /**Имеет сохраненную в бд ссылку*/
//     has_audio_url?: boolean;
//     created_at?: string;
//     updated_at?: string;
//     deleted_at?: string | null;
//     /** Цвет оформления плеера, если передаётся API. */
//     color?: string;
// }

// export interface TrackFile {
//     id: number;
//     track_id: number;
//     disk: string;
//     path: string;
//     mime_type: string | null;
//     size_bytes: number | null;
//     duration_ms: number | null;
//     sha256: string | null;
// }

// export interface Artist {
//     id: number;
//     name: string;
// }
//
// export interface Album {
//     id: number;
//     title: string;
// }

export interface AudioFile {
    url: string;
    filename?: string;
    size_bytes?: number | null;
    format?: string | null;
}