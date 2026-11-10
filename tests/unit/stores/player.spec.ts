import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';

import usePlayerStore from '@/stores/player';
import {useAuthStore} from '@/stores/auth';
import {useNetworkStore} from '@/stores/network';
import {PlaySourceListsEnum} from '@/types/PlaySourceListsEnum';
import type {Track} from '@/types/TrackType';
import type {PlaybackQueueItem} from '@/types/QueueType';

/**
 * Поведенческие тесты плеера: порядок воспроизведения
 * (shuffle/repeat), приоритет серверной очереди, офлайн-ветки.
 *
 * Звук — FakeAudioElement из tests/unit/setup.ts, сеть и скачивания
 * замоканы, API-плеера перехвачено: проверяем, что плеер в заданном
 * состоянии делает правильные шаги, а не то, как устроен внутри.
 */

const mocks = vi.hoisted(() => ({
    playRemoteTrack: vi.fn(),
    pauseRemotePlayback: vi.fn(),
    resumeRemotePlayback: vi.fn(),
    seekRemotePlayback: vi.fn(),
    getTrackAudio: vi.fn(),
    getPlayerState: vi.fn(),
    getPlayerDevices: vi.fn(),
    registerPlayerDevice: vi.fn(),
    activatePlayerDevice: vi.fn(),
    sendPlayerHeartbeat: vi.fn(),
    updatePlaybackOptions: vi.fn(),
    addTrackToQueue: vi.fn(),
    getPlayerQueue: vi.fn(),
    reorderPlayerQueue: vi.fn(),
    removeTrackFromQueue: vi.fn(),
    updateQueueItemStatus: vi.fn(),
    getWaveTracks: vi.fn(),
    sendWaveFeedback: vi.fn(),
    checkFavorite: vi.fn(),
    downloads: {
        isDownloaded: vi.fn(),
        hasLocalAudio: vi.fn(),
        getLocalAudioUrl: vi.fn(),
        statusOf: vi.fn(),
        progressOf: vi.fn(),
        download: vi.fn(),
        remove: vi.fn(),
        initialize: vi.fn(),
    },
}));

vi.mock('@/api/player', () => ({
    getTrackAudio: mocks.getTrackAudio,
    getPlayerState: mocks.getPlayerState,
    playRemoteTrack: mocks.playRemoteTrack,
    pauseRemotePlayback: mocks.pauseRemotePlayback,
    resumeRemotePlayback: mocks.resumeRemotePlayback,
    seekRemotePlayback: mocks.seekRemotePlayback,
    updatePlaybackOptions: mocks.updatePlaybackOptions,
    getPlayerDevices: mocks.getPlayerDevices,
    registerPlayerDevice: mocks.registerPlayerDevice,
    activatePlayerDevice: mocks.activatePlayerDevice,
    sendPlayerHeartbeat: mocks.sendPlayerHeartbeat,
}));

vi.mock('@/api/queue', () => ({
    addTrackToQueue: mocks.addTrackToQueue,
    getPlayerQueue: mocks.getPlayerQueue,
    reorderPlayerQueue: mocks.reorderPlayerQueue,
    removeTrackFromQueue: mocks.removeTrackFromQueue,
    updateQueueItemStatus: mocks.updateQueueItemStatus,
}));

vi.mock('@/api/wave', () => ({
    getWaveTracks: mocks.getWaveTracks,
    sendWaveFeedback: mocks.sendWaveFeedback,
}));

vi.mock('@/api/favorites', () => ({
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    checkFavorite: mocks.checkFavorite,
}));

vi.mock('@/stores/downloads', () => ({
    useDownloadsStore: () => mocks.downloads,
}));

vi.mock('@/lib/echo', () => ({
    default: {
        leave: vi.fn(),
        private: vi.fn(() => ({listen: vi.fn()})),
    },
}));

vi.mock('@ionic/vue', () => ({
    toastController: {
        create: vi.fn(async () => ({present: vi.fn()})),
    },
}));

vi.mock('@capacitor/device', () => ({
    Device: {
        getInfo: vi.fn(async () => ({model: 'Test'})),
    },
}));

let trackSeq = 0;

function makeTrack(title: string): Track {
    trackSeq += 1;

    return {
        id: trackSeq,
        title,
        source_type: 'app',
        source_id: null,
        duration: 180_000,
        duration_ms: 180_000,
        meta: {album: null, artists: [{id: 1, name: 'Tester'}]},
        file: null,
    };
}

function makeQueueItem(id: number, track: Track): PlaybackQueueItem {
    return {
        id,
        player_state_id: 1,
        track_id: Number(track.id),
        added_by_user_id: null,
        position: id,
        status: 'pending',
        track,
        added_by: null,
    };
}

async function whileOffline(run: () => Promise<void>): Promise<void> {
    const network = useNetworkStore();

    network.markServerDown();

    try {
        await run();
    } finally {
        network.markServerUp();
    }
}

describe('player store', () => {
    let player: ReturnType<typeof usePlayerStore>;

    beforeEach(() => {
        vi.clearAllMocks();

        setActivePinia(createPinia());

        const auth = useAuthStore();
        auth.user = {id: 1, name: 'Tester', email: 'test@skyfi.app'};

        player = usePlayerStore();

        // Устройство считается активным: онлайн-ветки идут
        // через «локальное воспроизведение».
        player.localDeviceId = 7;
        player.activeDeviceId = 7;

        // Все треки «скачаны»: resolveAudioUrl получает локальный URL.
        mocks.downloads.getLocalAudioUrl.mockResolvedValue(
            'blob:local-audio',
        );
        mocks.checkFavorite.mockResolvedValue({is_favorite: false});

        // backgroundSync у плеера вызывает .catch на результате —
        // моки отвечают промисами, как настоящий axios.
        mocks.playRemoteTrack.mockResolvedValue({state: {version: 1}});
        mocks.pauseRemotePlayback.mockResolvedValue({state: {version: 1}});
        mocks.resumeRemotePlayback.mockResolvedValue({state: {version: 1}});
        mocks.seekRemotePlayback.mockResolvedValue({});
        mocks.updatePlaybackOptions.mockResolvedValue({});
        mocks.updateQueueItemStatus.mockResolvedValue({});
        mocks.removeTrackFromQueue.mockResolvedValue({});
        mocks.getPlayerQueue.mockResolvedValue([]);
    });

    async function playList(titles: string[]): Promise<Track[]> {
        const tracks = titles.map((title) => makeTrack(title));

        player.setQueue(tracks, PlaySourceListsEnum.FAVORITES);
        await player.playTrack(tracks[0], PlaySourceListsEnum.FAVORITES);

        return tracks;
    }

    describe('порядок воспроизведения', () => {
        it('без shuffle/repeat играет список по порядку', async () => {
            await playList(['A', 'B', 'C']);

            await player.playNext();
            expect(player.currentTrack?.title).toBe('B');

            await player.playNext();
            expect(player.currentTrack?.title).toBe('C');
        });

        it('конец списка без repeat: останавливается на последнем', async () => {
            await playList(['A', 'B']);

            await player.playNext();
            await player.playNext();

            expect(player.currentTrack?.title).toBe('B');
            expect(player.isPlaying).toBe(false);
        });

        it('repeat all: с последнего трека возвращается на первый', async () => {
            await playList(['A', 'B']);

            player.repeatMode = 'all';

            await player.playNext();
            expect(player.currentTrack?.title).toBe('B');

            await player.playNext();
            expect(player.currentTrack?.title).toBe('A');
        });

        it('repeat one по окончании трека начинает его заново', async () => {
            await playList(['A', 'B']);
            player.repeatMode = 'one';

            await player.playNext('ended');

            expect(player.currentTrack?.title).toBe('A');
            expect(player.isPlaying).toBe(true);
        });

        it('shuffle: обходит весь список без повторов, потом стоп', async () => {
            await playList(['A', 'B', 'C', 'D']);
            await player.toggleShuffle();

            const visited = new Set<string>();

            for (let step = 0; step < 3; step++) {
                await player.playNext();

                const title = player.currentTrack?.title;

                expect(title).toBeTypeOf('string');
                expect(title).not.toBe('A');
                expect(visited.has(title!)).toBe(false);

                visited.add(title!);
            }

            expect(visited.size).toBe(3);

            await player.playNext();

            expect(player.isPlaying).toBe(false);
            expect(visited.size).toBe(3);
        });
    });

    describe('предыдущий трек', () => {
        it('прогресс больше 3 секунд — перемотка в начало, трек тот же', async () => {
            const tracks = await playList(['A', 'B', 'C']);

            await player.playTrack(tracks[2], PlaySourceListsEnum.FAVORITES);
            player.progress = 30;

            await player.playPrevious();

            expect(player.currentTrack?.title).toBe('C');
            expect(player.progress).toBe(0);
        });

        it('прогресс меньше 3 секунд — переключение на предыдущий', async () => {
            const tracks = await playList(['A', 'B', 'C']);

            await player.playTrack(tracks[2], PlaySourceListsEnum.FAVORITES);
            player.progress = 1;

            await player.playPrevious();

            expect(player.currentTrack?.title).toBe('B');
        });

        it('первый трек без repeat: предыдущего нет — перемотка в 0', async () => {
            await playList(['A', 'B']);
            player.progress = 1;

            await player.playPrevious();

            expect(player.currentTrack?.title).toBe('A');
            expect(player.progress).toBe(0);
        });
    });

    describe('серверная очередь', () => {
        it('playNext в приоритете играет ожидающий элемент очереди', async () => {
            await playList(['A', 'B']);
            const queued = makeQueueItem(51, makeTrack('Из очереди'));

            player.serverQueue = [queued];

            await player.playNext();

            expect(player.currentTrack?.title).toBe('Из очереди');
            expect(player.serverQueue).toHaveLength(0);
            expect(mocks.playRemoteTrack).toHaveBeenCalledWith(
                queued.track,
                PlaySourceListsEnum.QUEUE,
                expect.objectContaining({origin_device_id: 7}),
            );
        });
    });

    describe('офлайн', () => {
        it('скачанный трек играет без обращения к серверу', async () => {
            await whileOffline(async () => {
                const tracks = [makeTrack('A'), makeTrack('B')];

                player.setQueue(tracks, PlaySourceListsEnum.FAVORITES);

                mocks.downloads.hasLocalAudio.mockResolvedValue(true);

                await player.playTrack(
                    tracks[0],
                    PlaySourceListsEnum.FAVORITES,
                );

                expect(player.currentTrack?.title).toBe('A');
                expect(player.isPlaying).toBe(true);
                expect(mocks.playRemoteTrack).not.toHaveBeenCalled();
            });
        });

        it('не скачанный трек офлайн сервер не дёргает', async () => {
            await whileOffline(async () => {
                const tracks = [makeTrack('A'), makeTrack('B')];

                player.setQueue(tracks, PlaySourceListsEnum.FAVORITES);

                mocks.downloads.hasLocalAudio.mockResolvedValue(false);
                mocks.downloads.getLocalAudioUrl.mockResolvedValue(null);

                await player.playTrack(
                    tracks[0],
                    PlaySourceListsEnum.FAVORITES,
                );

                // Запуск не состоялся (нет локального файла),
                // главное — серверная ветка не вызывалась.
                expect(player.isPlaying).toBe(false);
                expect(mocks.playRemoteTrack).not.toHaveBeenCalled();
            });
        });

        it('togglePlay офлайн без текущего трека запускает первый из списка', async () => {
            await whileOffline(async () => {
                const tracks = [makeTrack('A'), makeTrack('B')];

                player.setQueue(tracks, PlaySourceListsEnum.FAVORITES);

                mocks.downloads.hasLocalAudio.mockResolvedValue(true);

                await player.togglePlay();

                expect(player.currentTrack?.title).toBe('A');
                expect(player.isPlaying).toBe(true);
                expect(mocks.playRemoteTrack).not.toHaveBeenCalled();
            });
        });
    });

    describe('восстановление состояния после перезагрузки', () => {
        it('сервер говорит «playing», но звук не пошёл — показываем паузу', async () => {
            const track = makeTrack('Восстановленный');

            mocks.getPlayerDevices.mockResolvedValue({
                data: [
                    {
                        id: 7,
                        device_uuid: 'test-uuid',
                        name: 'Tester',
                        is_active: true,
                        last_seen_at: new Date().toISOString(),
                    },
                ],
            });

            mocks.registerPlayerDevice.mockResolvedValue({
                id: 7,
                device_uuid: 'test-uuid',
                name: 'Tester',
                is_active: true,
                last_seen_at: new Date().toISOString(),
            });

            localStorage.setItem('skyfi_device_uuid', 'test-uuid');

            mocks.getPlayerState.mockResolvedValue({
                state: {
                    version: 1,
                    is_playing: true,
                    position_seconds: 30,
                    active_device_id: 7,
                    play_source: 'favorites',
                    shuffle_enabled: false,
                    repeat_mode: 'off',
                    current_track: track,
                    queue: [],
                },
                queue: [],
            });

            await player.initializePlayerDevice();

            // Без пользовательского жеста браузер звук не пустил:
            // честная пауза, а не «крутится без звука».
            expect(player.isPlaying).toBe(false);
            expect(player.currentTrack?.title).toBe('Восстановленный');
        });
    });

    describe('play/pause', () => {
        it('togglePlay переключает паузу и продолжение', async () => {
            await playList(['A', 'B']);

            expect(player.isPlaying).toBe(true);

            await player.togglePlay();
            expect(player.isPlaying).toBe(false);

            await player.togglePlay();
            expect(player.isPlaying).toBe(true);
        });

        it('серверный запуск (пульт) идёт с origin_device_id', async () => {
            const track = makeTrack('A');

            mocks.playRemoteTrack.mockResolvedValue({
                state: {version: 1, current_track: track},
            });

            // Пульт: устройство не активно, но сеть есть.
            player.activeDeviceId = 99;

            await player.playTrack(track, PlaySourceListsEnum.SEARCH);

            expect(mocks.playRemoteTrack).toHaveBeenCalledWith(
                track,
                PlaySourceListsEnum.SEARCH,
                expect.objectContaining({origin_device_id: 7}),
            );
        });
    });
});
