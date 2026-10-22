export type TrackMenuItem = {
    id: string | number;
    title: string;
    artist?: string;
    artists?: Array<{ name: string }>;
    cover?: string;
    symbol?: string;
};