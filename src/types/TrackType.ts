
export type TrackType = {
    id: string | number;
    title: string;
    artist?: string;
    artists?: Array<{ name: string }>;
    cover?: string;
    symbol?: string;
};

export interface Track {
    id: number;
    title: string;
    description: string | null;
    uploaded_by: number | null;
    source_type: string;
    source_id: string | null;
    is_favorite?: boolean;
    url?: string;
    status: string;
    artists?: Artist[];
    album?: Album | null;
    album_id: number | null;
    play_count: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    file?: TrackFile;
    has_cached_audio?: boolean;
}

export interface TrackFile {
    id: number;
    track_id: number;
    variant: string;
    disk: string;
    path: string;
    mime_type: string;
    size_bytes: number;
    duration_seconds: number | null;
    bitrate_kbps: number | null;
    sample_rate: number | null;
    sha256: string | null;
    created_at: string;
    updated_at: string;
}

export interface Artist {
    id: number;
    name: string;
}

export interface Album {
    id: number;
    title: string;
}

export interface AudioFile {
    url: string;
    filename?: string;
    size_bytes?: number | null;
    format?: string | null;
}