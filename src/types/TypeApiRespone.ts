import {Track} from "@/types/TrackType";
import {PlaybackState} from "@/types/PlayerType";
import {PlaybackQueueItem} from "@/types/QueueType";

/**
 * Базовый тип ари ответа
 */
export interface ApiResponse<T> {
    errors: unknown[] | Record<string, unknown> | null;
    data: T;
    pagination: unknown | null;
}

export interface SearchResponse {
    data: {
        items: Track[];
        meta: {
            query: string;
            total: number;
            page: number;
            per_page: number;
            last_page: number;
        };
    };
}

export interface TracksResponse {
    data: Track[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
}

export interface PlayerActionResponse {
    message: string;
    state: PlaybackState;
}

export interface PlayerStateResponse {
    state: PlaybackState;
    queue: PlaybackQueueItem[];
}

export interface YandexMusicFavoriteSummary {
    total: number;
    existing?: number;
    new_tracks?: number;
    already_imported?: number;
}

export interface YandexMusicImportStart {
    job_id?: string;
    jobId?: string;
    status?: string;
    total?: number;
    processed?: number;
    imported?: number;
    skipped?: number;
    failed?: number;
    progress?: number;
    message?: string;
}

export interface YandexMusicImportStatus {
    status: string;
    total?: number;
    processed?: number;
    imported?: number;
    skipped?: number;
    failed?: number;
    progress?: number;
    message?: string;
}

// export interface PlayerQueueResponse {
//     data: PlaybackQueueItem[];
// }
