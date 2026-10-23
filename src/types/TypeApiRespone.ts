import {Track} from "@/types/TrackType";

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