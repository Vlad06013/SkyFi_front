import {Track} from "@/types/TrackType";

export interface PlaybackQueueItem {
    id: number;
    player_state_id: number;
    track_id: number;
    added_by_user_id: number | null;

    position: number;
    status: 'pending' | 'played' | '';

    track: Track;
    added_by?: {
        id: number;
        name: string;
    } | null;
}