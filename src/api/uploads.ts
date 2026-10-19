import { http } from '@/api/http';

export interface UploadTrackPayload {
    title: string;
    description?: string;
    audio: File;

    artist_id?: number;
    artist_name?: string;

    album_id?: number;
    album_title?: string;

    genre_id?: number;
    genre_name?: string;
}

export interface UploadedTrackFile {
    id: number;
    variant: string;
    disk: string;
    path: string;
    mime_type: string;
    size_bytes: number;
    duration_seconds: number | null;
    bitrate_kbps?: number | null;
    sample_rate?: number | null;
}

export interface UploadedTrack {
    id: number;
    title: string;
    description: string | null;
    status: string;
    source_type: string;
    album_id: number | null;
    artists: Array<{
        id: number;
        name: string;
    }>;
    album: {
        id: number;
        title: string;
    } | null;
    genres: Array<{
        id: number;
        name: string;
    }>;
    files: UploadedTrackFile[];
}

export interface UploadTrackResponse {
    message: string;
    data: UploadedTrack;
}

/**
 * Загрузить музыкальный трек.
 */
export async function uploadTrack(
    payload: UploadTrackPayload,
    onProgress?: (progress: number) => void,
): Promise<UploadTrackResponse> {
    const formData = new FormData();

    formData.append('title', payload.title.trim());
    formData.append('audio', payload.audio);

    if (payload.description?.trim()) {
        formData.append('description', payload.description.trim());
    }

    if (payload.artist_id !== undefined) {
        formData.append('artist_id', String(payload.artist_id));
    } else if (payload.artist_name?.trim()) {
        formData.append('artist_name', payload.artist_name.trim());
    }

    if (payload.album_id !== undefined) {
        formData.append('album_id', String(payload.album_id));
    } else if (payload.album_title?.trim()) {
        formData.append('album_title', payload.album_title.trim());
    }

    if (payload.genre_id !== undefined) {
        formData.append('genre_id', String(payload.genre_id));
    } else if (payload.genre_name?.trim()) {
        formData.append('genre_name', payload.genre_name.trim());
    }

    const response = await http.post<UploadTrackResponse>(
        '/tracks/upload',
        formData,
        {
            timeout: 300000,

            onUploadProgress(event) {
                if (!event.total || !onProgress) {
                    return;
                }

                const percent = Math.round(
                    (event.loaded / event.total) * 100,
                );

                onProgress(Math.min(percent, 100));
            },
        },
    );

    return response.data;
}
