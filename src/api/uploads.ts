import axios from 'axios';
import { http } from '@/api/http';
import type { Track } from '@/types/TrackType';

// ============================================
// ТИПЫ
// ============================================

export interface UploadTrackPayload {
    title: string;
    description?: string;
    audio: File;

    artist_ids?: number[];
    artist_names?: string[];

    album_id?: number;
    album_title?: string;

    genre_id?: number;
    genre_name?: string;
}

export interface UploadTrackResponse {
    message: string;
    data: Track;
}

export interface UploadsResponse {
    data: Track[];
}

// ============================================
// ЗАГРУЗКА МУЗЫКАЛЬНОГО ТРЕКА
// ============================================

export async function uploadTrack(
    payload: UploadTrackPayload,
    onProgress?: (progress: number) => void,
): Promise<UploadTrackResponse> {
    const title = payload.title.trim();

    if (!title) {
        throw new Error('Укажи название трека.');
    }

    if (!(payload.audio instanceof File)) {
        throw new Error('Необходимо выбрать аудиофайл.');
    }

    if (payload.audio.size === 0) {
        throw new Error('Выбранный аудиофайл пуст.');
    }

    // Формируем multipart/form-data.
    const formData = new FormData();

    formData.append('title', title);

    formData.append(
        'audio',
        payload.audio,
        payload.audio.name,
    );

    if (payload.description?.trim()) {
        formData.append(
            'description',
            payload.description.trim(),
        );
    }

    // Исполнители: выбранные из подсказок — по id,
    // рукописные — по имени.
    if (payload.artist_ids?.length) {
        for (const id of payload.artist_ids) {
            formData.append('artist_ids[]', String(id));
        }
    }

    if (payload.artist_names?.length) {
        for (const name of payload.artist_names) {
            formData.append('artist_names[]', name.trim());
        }
    }

    // Альбом.
    if (payload.album_id !== undefined) {
        formData.append(
            'album_id',
            String(payload.album_id),
        );
    } else if (payload.album_title?.trim()) {
        formData.append(
            'album_title',
            payload.album_title.trim(),
        );
    }

    // Жанр.
    if (payload.genre_id !== undefined) {
        formData.append(
            'genre_id',
            String(payload.genre_id),
        );
    } else if (payload.genre_name?.trim()) {
        formData.append(
            'genre_name',
            payload.genre_name.trim(),
        );
    }

    // Проверяем добавление файла.
    const audioEntry = formData.get('audio');

    if (
        !(audioEntry instanceof File) ||
        audioEntry.size === 0
    ) {
        throw new Error(
            'Не удалось добавить аудиофайл в запрос.',
        );
    }


    try {
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

                    onProgress(
                        Math.min(100, Math.max(0, percent)),
                    );
                },
            },
        );

        return response.data;
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const responseData = error.response?.data;

            console.error('Ошибка загрузки трека:', {
                status,
                statusText: error.response?.statusText,
                message: error.message,
                response: responseData,
                validationErrors: responseData?.errors,
            });

            if (status === 422) {
                const validationErrors = responseData?.errors;

                if (
                    validationErrors &&
                    typeof validationErrors === 'object'
                ) {
                    const messages: string[] = [];

                    for (const [field, errors] of Object.entries(
                        validationErrors as Record<string, unknown>,
                    )) {
                        const fieldMessages = Array.isArray(errors)
                            ? errors
                            : [errors];

                        for (const message of fieldMessages) {
                            if (typeof message === 'string') {
                                messages.push(
                                    `${field}: ${message}`,
                                );
                            }
                        }
                    }

                    if (messages.length > 0) {
                        throw new Error(
                            `Ошибка проверки данных: ${messages.join('; ')}`,
                        );
                    }
                }

                throw new Error(
                    responseData?.message ||
                    'Сервер отклонил данные трека. Проверь обязательные поля.',
                );
            }

            if (status === 401) {
                throw new Error(
                    'Для загрузки музыки необходимо войти в аккаунт.',
                );
            }

            if (status === 403) {
                throw new Error(
                    'У тебя нет разрешения на загрузку музыки.',
                );
            }

            if (status === 413) {
                throw new Error(
                    'Файл слишком большой.',
                );
            }

            if (!error.response) {
                throw new Error(
                    'Не удалось подключиться к серверу. Проверь соединение.',
                );
            }

            throw new Error(
                responseData?.message ||
                `Ошибка сервера: ${status ?? 'неизвестный статус'}.`,
            );
        }

        console.error(
            'Непредвиденная ошибка загрузки трека:',
            error,
        );

        throw error;
    }
}

// ============================================
// СПИСОК ЗАГРУЖЕННЫХ ТРЕКОВ
// ============================================

/**
 * Получить треки, загруженные текущим пользователем.
 *
 * GET /uploads
 */
export async function getUploadedTracks(): Promise<UploadsResponse> {
    const response = await http.get<UploadsResponse>('/uploads');

    return response.data;
}