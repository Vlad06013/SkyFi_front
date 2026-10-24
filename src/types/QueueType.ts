import {Track} from "@/types/TrackType";

export interface PlaybackQueueItem {
    id: number;
    playback_state_id: number;
    track_id: number;
    added_by_user_id: number | null;

    position: number;
    status: 'pending' | 'played';

    track: Track;
    added_by?: {
        id: number;
        name: string;
    } | null;

    created_at: string;
    updated_at: string;
}