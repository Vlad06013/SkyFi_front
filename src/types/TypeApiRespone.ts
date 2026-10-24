import {Track} from "@/types/TrackType";
import {PlaybackState} from "@/types/PlayerType";
import {PlaybackQueueItem} from "@/types/QueueType";

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

export interface PlayerQueueResponse {
    data: PlaybackQueueItem[];
}
