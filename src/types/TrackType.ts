
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
    /**
     * Длительность в миллисекундах на верхнем уровне трека.
     * Бэкенд дублирует её в состояние плеера (file.duration_ms
     * там может отсутствовать для внешних треков).
     */
    duration_ms?: number | null;
    meta: TrackMeta;
    file: TrackFile | null;
    /** Порядок в избранном (favorites.sort): больше = выше. Только у избранного. */
    sort?: number | null;
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
    /** Когда ссылка в path была получена/обновлена. У загрузок — null. */
    path_fetch_at?: string | null;
    /** TTL ссылки в секундах, константа источника с бэка. null — бессрочно. */
    path_ttl_sec?: number | null;
    created_at: string;
    updated_at: string;
}

export interface AudioFile {
    url: string;
    filename?: string;
    size_bytes?: number | null;
    format?: string | null;
}