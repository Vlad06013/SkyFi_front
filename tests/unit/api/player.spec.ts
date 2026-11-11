import {describe, expect, it} from 'vitest';

import {sanitizeTrackForApi} from '@/api/player';
import type {Track} from '@/types/TrackType';

/**
 * Трек перед отправкой на бэкенд: кеш скачанных подменяет
 * meta.album.cover_path локальным файлом/objectURL/data-URI
 * (для офлайн-показа), а сервер принимает только http(s)-URL —
 * весь запрос отлетал 422. Проверяем санитайзер.
 */

function makeTrack(coverPath: string | null): Track {
    return {
        id: 1,
        title: 'T',
        source_type: 'upload',
        source_id: null,
        duration: 1000,
        duration_ms: 1000,
        meta: {
            album: {
                id: '1',
                title: 'A',
                release_year: null,
                cover_path: coverPath,
            },
            artists: [{id: '1', name: 'X'}],
        },
        file: null,
    };
}

describe('sanitizeTrackForApi', () => {
    it('data-URI обложки из кеша приводит к null', () => {
        const track = makeTrack('data:image/webp;base64,UklGRg');

        const sent = sanitizeTrackForApi(track);

        expect(sent.meta.album?.cover_path).toBeNull();
        // Исходный объект не мутируем: офлайн-показ
        // обложки продолжает работать.
        expect(track.meta.album?.cover_path)
            .toBe('data:image/webp;base64,UklGRg');
    });

    it('http(s) обложки не трогаем', () => {
        const track = makeTrack('https://example.com/cover.webp');

        expect(sanitizeTrackForApi(track)).toBe(track);
    });

    it('локальный путь нативного кеша приводит к null', () => {
        const track = makeTrack('file:///data/user/0/.../cover.webp');

        expect(sanitizeTrackForApi(track).meta.album?.cover_path)
            .toBeNull();
    });

    it('обложки нет — трек возвращается как есть', () => {
        const track = makeTrack(null);

        expect(sanitizeTrackForApi(track)).toBe(track);
    });
});
