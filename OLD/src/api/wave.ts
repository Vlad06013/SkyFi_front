import { http } from '@/api/http';
import type { Track } from '@/types/TrackType';

/**
 * Типы реакций «Моей Волны» — совпадают с rotor feedback API
 * Яндекса. like/dislike обучают персональную ротацию.
 */
export type WaveFeedbackType =
    | 'like'
    | 'dislike'
    | 'trackFinished'
    | 'skip'
    | 'radioStarted'
    | 'trackStarted';

/**
 * Получить цепочку треков «Моей Волны» Яндекс Музыки.
 *
 * GET /skyfy/wave
 *
 * Треки внешние (source_type = yandex_music): воспроизводятся
 * через единый контракт, как результаты поиска.
 */
export async function getWaveTracks(
    limit = 5,
    queue?: string | null,
): Promise<Track[]> {
    const response = await http.get<{ data: Track[] }>(
        '/wave',
        {
            params: {
                limit,
                queue: queue ?? null,
            },
            timeout: 60000,
        },
    );

    return response.data.data;
}

/**
 * Отправить реакцию на трек волны.
 *
 * POST /skyfy/wave/feedback
 */
export async function sendWaveFeedback(
    trackId: string | number,
    type: WaveFeedbackType,
    batchId?: string | null,
    totalPlayedSeconds?: number,
): Promise<void> {
    await http.post(
        '/wave/feedback',
        {
            track_id: String(trackId),
            type,
            batch_id: batchId ?? null,
            total_played_seconds:
                totalPlayedSeconds != null
                    ? Math.round(totalPlayedSeconds * 10) / 10
                    : null,
        },
        { timeout: 60000 },
    );
}
