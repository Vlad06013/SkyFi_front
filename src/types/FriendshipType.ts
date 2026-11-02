export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface FriendshipUser {
    id: number;
    name: string;
    avatar: string | null;
}

export interface Friendship {
    id: number;
    sender: FriendshipUser;
    receiver: FriendshipUser;
    status: FriendshipStatus;
    created_at: string | null;
}

export interface UserSearchResult {
    id: number;
    name: string;
    avatar: string | null;
    friendship_id: number | null;
    friendship_status: FriendshipStatus | null;
}

export interface FriendProfile {
    id: number;
    name: string;
    email: string;
    avatar: string | null;
    friendship: {
        id: number;
        status: FriendshipStatus;
    } | null;
}

export interface FriendNowPlaying {
    is_playing: boolean;
    track: import('@/types/TrackType').Track | null;
}

/** Трек, которым поделились с текущим пользователем. */
export interface TrackShareItem {
    id: number;
    sender: {
        id: number;
        name: string;
    };
    track: import('@/types/TrackType').Track;
    created_at: string | null;
}
