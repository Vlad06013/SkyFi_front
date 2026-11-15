import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import axios from 'axios';

import {useLibrary} from '@/views/Favorites/favorite';
import {useAuthStore} from '@/stores/auth';
import type {Track} from '@/types/TrackType';

/**
 * Логика вкладки «Избранное»: пагинация показа, сортировка
 * (drag & drop, «в начало списка») с оптимистичным откатом,
 * загрузка списка (кеш → сервер) и её ошибки.
 */

const mocks = vi.hoisted(() => ({
    getFavorites: vi.fn(),
    updateFavoritesSort: vi.fn(),
    getCachedCollection: vi.fn(),
    saveCachedCollection: vi.fn(),
    player: {
        isPlaying: false,
        currentTrack: null as Track | null,
        liked: false,
        setQueue: vi.fn(),
        playTrack: vi.fn(async () => undefined),
    },
}));

vi.mock('@/api/favorites', () => ({
    getFavorites: mocks.getFavorites,
    updateFavoritesSort: mocks.updateFavoritesSort,
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    checkFavorite: vi.fn(),
}));

vi.mock('@/db/appDatabase', () => ({
    getCachedCollection: mocks.getCachedCollection,
    saveCachedCollection: mocks.saveCachedCollection,
}));

vi.mock('@/stores/player', () => ({
    default: () => mocks.player,
}));

let trackSeq = 0;

function makeTrack(title: string): Track {
    trackSeq += 1;

    return {
        id: trackSeq,
        title,
        sort: 0,
        source_type: 'app',
        source_id: null,
        duration: 180_000,
        meta: {album: null, artists: [{id: 1, name: 'Tester'}]},
        file: null,
    };
}

function titles(tracks: Track[]): string[] {
    return tracks.map((track) => track.title);
}

describe('useLibrary (избранное)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setActivePinia(createPinia());

        useAuthStore().user = {
            id: 1,
            name: 'Tester',
            email: 'test@skyfi.app',
        };

        mocks.getCachedCollection.mockResolvedValue(null);
        mocks.getFavorites.mockResolvedValue([]);
        mocks.updateFavoritesSort.mockResolvedValue(undefined);
        mocks.saveCachedCollection.mockResolvedValue(undefined);
    });

    describe('пагинация показа', () => {
        it('показывает список частями по 20, догружает по шагам', async () => {
            const library = useLibrary();

            library.tracks.value = Array.from(
                {length: 45},
                (_, index) => makeTrack(`T${index + 1}`),
            );

            expect(library.visibleTracks.value).toHaveLength(20);
            expect(library.hasMoreTracks.value).toBe(true);

            await library.showMoreTracks();
            expect(library.visibleTracks.value).toHaveLength(40);
            expect(library.hasMoreTracks.value).toBe(true);

            await library.showMoreTracks();
            expect(library.visibleTracks.value).toHaveLength(45);
            expect(library.hasMoreTracks.value).toBe(false);
        });

        it('перезагрузка списка сбрасывает пагинацию на первую страницу', async () => {
            const library = useLibrary();

            library.tracks.value = Array.from(
                {length: 45},
                (_, index) => makeTrack(`T${index + 1}`),
            );

            await library.showMoreTracks();
            expect(library.visibleTracks.value).toHaveLength(40);

            mocks.getFavorites.mockResolvedValue(
                Array.from(
                    {length: 30},
                    (_, index) => makeTrack(`N${index + 1}`),
                ),
            );

            await library.loadLibrary();

            expect(library.visibleTracks.value).toHaveLength(20);
            expect(library.visibleTracks.value[0]?.title).toBe('N1');
        });
    });

    describe('сортировка (drag & drop)', () => {
        it('переставляет трек оптимистично и шлёт sort по убыванию', async () => {
            const library = useLibrary();

            library.tracks.value = [
                makeTrack('A'),
                makeTrack('B'),
                makeTrack('C'),
                makeTrack('D'),
            ];

            await library.reorderFavorites(1, 3);

            expect(titles(library.tracks.value)).toEqual([
                'A',
                'C',
                'D',
                'B',
            ]);

            // Верх списка получает самый большой sort, низ — ноль.
            expect(mocks.updateFavoritesSort).toHaveBeenCalledWith([
                {track_id: expect.any(Number), sort: 3},
                {track_id: expect.any(Number), sort: 2},
                {track_id: expect.any(Number), sort: 1},
                {track_id: expect.any(Number), sort: 0},
            ]);

            // Локальные sort приведены к новым значениям.
            expect(
                library.tracks.value.map((track) => track.sort),
            ).toEqual([3, 2, 1, 0]);
        });

        it('без изменений и за границами списка — запрос не уходит', async () => {
            const library = useLibrary();

            library.tracks.value = [makeTrack('A'), makeTrack('B')];

            await library.reorderFavorites(0, 0);
            await library.reorderFavorites(-1, 1);
            await library.reorderFavorites(0, 5);

            expect(mocks.updateFavoritesSort).not.toHaveBeenCalled();
        });

        it('ошибка сервера откатывает порядок к прежнему', async () => {
            const library = useLibrary();

            library.tracks.value = [
                makeTrack('A'),
                makeTrack('B'),
                makeTrack('C'),
            ];

            mocks.updateFavoritesSort.mockRejectedValue(
                new Error('сеть упала'),
            );

            await library.reorderFavorites(0, 2);

            expect(titles(library.tracks.value)).toEqual([
                'A',
                'B',
                'C',
            ]);
        });
    });

    describe('в начало списка', () => {
        it('первый трек — no-op', async () => {
            const library = useLibrary();

            library.tracks.value = [
                makeTrack('A'),
                makeTrack('B'),
            ];

            await library.moveFavoriteToTop(library.tracks.value[0]);

            expect(mocks.updateFavoritesSort).not.toHaveBeenCalled();
        });

        it('трек из середины встаёт наверх с пересчётом sort', async () => {
            const library = useLibrary();

            library.tracks.value = [
                makeTrack('A'),
                makeTrack('B'),
                makeTrack('C'),
            ];

            await library.moveFavoriteToTop(library.tracks.value[2]);

            expect(titles(library.tracks.value)).toEqual([
                'C',
                'A',
                'B',
            ]);
            expect(mocks.updateFavoritesSort).toHaveBeenCalledTimes(1);
        });
    });

    describe('загрузка списка', () => {
        it('сервер — источник правды: перекрывает локальный кеш', async () => {
            const library = useLibrary();

            const cached = makeTrack('С кеша');

            mocks.getCachedCollection.mockResolvedValue({
                tracks: [{id: cached.id, position: 0, track: cached}],
            });

            mocks.getFavorites.mockResolvedValue([
                makeTrack('С сервера'),
            ]);

            await library.loadLibrary();

            expect(titles(library.tracks.value)).toEqual(['С сервера']);
            expect(mocks.saveCachedCollection).toHaveBeenCalled();
        });

        it('сеть пала и кеша нет — понятная ошибка', async () => {
            const library = useLibrary();

            mocks.getFavorites.mockRejectedValue(
                new axios.AxiosError('Network Error'),
            );

            await library.loadLibrary();

            expect(library.error.value).toBe(
                'Нет подключения к серверу и локального кеша избранного.',
            );
            expect(library.tracks.value).toHaveLength(0);
        });

        it('401 — предлагает войти в аккаунт', async () => {
            const library = useLibrary();

            mocks.getFavorites.mockRejectedValue(
                new axios.AxiosError(
                    'Unauthorized',
                    undefined,
                    undefined,
                    undefined,
                    {status: 401, data: {}} as never,
                ),
            );

            await library.loadLibrary();

            expect(library.error.value).toBe(
                'Войди в аккаунт, чтобы просматривать избранное.',
            );
        });
    });
});
