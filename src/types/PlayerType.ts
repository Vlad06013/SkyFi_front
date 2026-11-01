import {Track} from "@/types/TrackType";


export type PlayerDeviceType =
    | 'phone'
    | 'computer'
    | 'car'
    | 'tv';

export interface PlayerDevice {
    id: number;
    user_id: number;
    device_uuid: string;
    name: string;
    type: PlayerDeviceType;
    is_active: boolean;
    last_seen_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface PlaybackState {
    id: number;
    user_id: number;

    current_track_id: number | null;
    /** Трек основного списка, к которому нужно вернуться после серверной очереди. */
    last_source_track_id: number | null;
    active_device_id: number | null;

    position_seconds: number;
    is_playing: boolean;

    repeat_mode: 'off' | 'all' | 'one';
    shuffle_enabled: boolean;

    /** Источник списка, из которого играет трек (favorites, search, ...). */
    play_source?: string;

    version: number;

    current_track?: Track | null;
    active_device?: PlayerDevice | null;

    created_at: string;
    updated_at: string;
}

