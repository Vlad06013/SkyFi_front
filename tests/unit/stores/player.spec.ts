import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
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
    getExternalTrackAudioUrl: vi.fn(),
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
        listDownloadedTracks: vi.fn(),
    },
}));

vi.mock('@/api/player', () => ({
    getTrackAudio: mocks.getTrackAudio,
    getExternalTrackAudioUrl: mocks.getExternalTrackAudioUrl,
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
        source_type: 'upload',
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
        mocks.downloads.listDownloadedTracks.mockResolvedValue([]);
        mocks.checkFavorite.mockResolvedValue({is_favorite: false});

        // backgroundSync у плеера вызывает .catch на результате —
        // моки отвечают промисами, как настоящий axios.
        mocks.playRemoteTrack.mockResolvedValue({state: {version: 1}});
        mocks.pauseRemotePlayback.mockResolvedValue({state: {version: 1}});
        mocks.resumeRemotePlayback.mockResolvedValue({state: {version: 1}});
        mocks.seekRemotePlayback.mockResolvedValue({});
        mocks.getExternalTrackAudioUrl.mockResolvedValue({
            url: 'blob:external-audio',
        });
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

        it('прогресс меньше 3 секунд — возврат по истории к реально игранному', async () => {
            const tracks = await playList(['A', 'B', 'C']);

            await player.playTrack(tracks[2], PlaySourceListsEnum.FAVORITES);
            player.progress = 1;

            await player.playPrevious();

            // История честная: прыжок был A → C, B не играл.
            expect(player.currentTrack?.title).toBe('A');
        });

        it('первый трек без repeat: предыдущего нет — перемотка в 0', async () => {
            await playList(['A', 'B']);
            player.progress = 1;

            await player.playPrevious();

            expect(player.currentTrack?.title).toBe('A');
            expect(player.progress).toBe(0);
        });
    });

    describe('план и история', () => {
        it('shuffle: «назад» после первого next возвращает к игравшему', async () => {
            await playList(['A', 'B', 'C', 'D']);
            await player.toggleShuffle();

            const first = player.previewNextTrack?.title;
            expect(first).toBeTypeOf('string');

            await player.playNext();
            expect(player.currentTrack?.title).toBe(first);

            player.progress = 1;
            await player.playPrevious();

            expect(player.currentTrack?.title).toBe('A');
        });

        it('shuffle: «назад» шагает по реальной истории, в начале — перемотка', async () => {
            await playList(['A', 'B', 'C', 'D']);
            await player.toggleShuffle();

            await player.playNext();
            const second = player.currentTrack?.title;

            await player.playNext();

            player.progress = 1;
            await player.playPrevious();
            expect(player.currentTrack?.title).toBe(second);

            player.progress = 1;
            await player.playPrevious();
            expect(player.currentTrack?.title).toBe('A');

            // История кончилась — перемотка в начало.
            player.progress = 1;
            await player.playPrevious();
            expect(player.currentTrack?.title).toBe('A');
            expect(player.progress).toBe(0);
        });

        it('next после previous возвращает трек, откуда пришли', async () => {
            await playList(['A', 'B', 'C', 'D']);
            await player.toggleShuffle();

            await player.playNext();
            const target = player.currentTrack?.title;

            player.progress = 1;
            await player.playPrevious();
            expect(player.currentTrack?.title).toBe('A');

            await player.playNext();
            expect(player.currentTrack?.title).toBe(target);
        });

        it('превью следующего совпадает с реальным next (shuffle)', async () => {
            await playList(['A', 'B', 'C', 'D']);
            await player.toggleShuffle();

            for (let step = 0; step < 3; step++) {
                const preview = player.previewNextTrack?.title;

                expect(preview).toBeTypeOf('string');

                await player.playNext();

                expect(player.currentTrack?.title).toBe(preview);
            }

            // План исчерпан — превью честно пустое.
            expect(player.previewNextTrack).toBeNull();
        });

        it('repeat all в shuffle: круг закончился — начинается новый, не стоп', async () => {
            await playList(['A', 'B', 'C']);
            await player.toggleShuffle();
            player.repeatMode = 'all';

            for (let step = 0; step < 3; step++) {
                await player.playNext();
            }

            expect(player.isPlaying).toBe(true);

            // Новый круг: воспроизведение живо, трек из списка.
            await player.playNext();

            expect(player.isPlaying).toBe(true);
            expect(['A', 'B', 'C']).toContain(player.currentTrack?.title);
        });

        it('дозагрузка того же списка: история и план сохраняются', async () => {
            const tracks = await playList(['A', 'B']);

            await player.playNext();
            expect(player.currentTrack?.title).toBe('B');

            // Infinite-список подгрузил следующую страницу.
            player.setQueue(
                [...tracks, makeTrack('C'), makeTrack('D')],
                PlaySourceListsEnum.FAVORITES,
            );

            player.progress = 1;
            await player.playPrevious();
            expect(player.currentTrack?.title).toBe('A');

            await player.playNext();
            expect(player.currentTrack?.title).toBe('B');

            await player.playNext();
            expect(player.currentTrack?.title).toBe('C');
        });

        it('новый список: история стёрта, следующий — первый трек нового', async () => {
            await playList(['A', 'B', 'C']);

            await player.playNext();
            expect(player.currentTrack?.title).toBe('B');

            const fresh = [makeTrack('X'), makeTrack('Y')];
            player.setQueue(fresh, PlaySourceListsEnum.PLAYLIST);

            player.progress = 1;
            await player.playPrevious();

            // Истории в новом списке нет — перемотка.
            expect(player.currentTrack?.title).toBe('B');
            expect(player.progress).toBe(0);

            await player.playNext();
            expect(player.currentTrack?.title).toBe('X');
        });

        it('очередь: прерванный трек списка помнится, next ходит по плану', async () => {
            await playList(['A', 'B', 'C']);
            const queued = makeQueueItem(51, makeTrack('Из очереди'));

            player.serverQueue = [queued];

            await player.playNext();
            expect(player.currentTrack?.title).toBe('Из очереди');

            // «Назад» из очереди — к прерванному треку списка.
            player.progress = 1;
            await player.playPrevious();
            expect(player.currentTrack?.title).toBe('A');

            // Очередь после ухода с её трека потреблена.
            expect(player.serverQueue).toHaveLength(0);

            await player.playNext();
            expect(player.currentTrack?.title).toBe('B');
        });
    });

    describe('волна: shuffle/repeat не действуют', () => {
        function makeWaveTrack(title: string): Track {
            const track = makeTrack(title);

            track.source_type = 'yandex_music';
            track.source_id = `ym-${title}`;

            return track;
        }

        async function startTestWave(): Promise<void> {
            const batch = ['W1', 'W2', 'W3', 'W4', 'W5'].map(makeWaveTrack);

            mocks.playRemoteTrack.mockImplementation(
                async (track: Track) => ({
                    state: {version: 1, current_track: track},
                }),
            );

            mocks.getWaveTracks.mockResolvedValue([]);
            mocks.sendWaveFeedback.mockResolvedValue(undefined);

            await player.startWave(batch, 0);
        }

        it('toggleShuffle и toggleRepeatMode в волне — no-op', async () => {
            await startTestWave();

            expect(player.waveMode).toBe(true);

            await player.toggleShuffle();
            expect(player.isShuffleEnabled).toBe(false);

            await player.toggleRepeatMode();
            expect(player.repeatMode).toBe('off');
        });

        it('repeat one не действует: ended в волне переключает трек', async () => {
            await startTestWave();

            player.repeatMode = 'one';

            await player.playNext('ended');

            expect(player.currentTrack?.title).toBe('W2');
        });

        it('конец порции: волна подгружает следующую и играет дальше', async () => {
            await startTestWave();

            mocks.getWaveTracks.mockResolvedValue(
                ['W6', 'W7'].map(makeWaveTrack),
            );

            for (let step = 0; step < 4; step++) {
                await player.playNext();
            }

            expect(player.currentTrack?.title).toBe('W5');

            await player.playNext();

            expect(mocks.getWaveTracks).toHaveBeenCalledWith(
                5,
                expect.anything(),
            );
            expect(player.currentTrack?.title).toBe('W6');
        });

        it('«назад» в волне возвращает предыдущий трек волны', async () => {
            await startTestWave();

            await player.playNext();
            expect(player.currentTrack?.title).toBe('W2');

            player.progress = 1;
            await player.playPrevious();
            expect(player.currentTrack?.title).toBe('W1');
        });

        it('предзагрузка: следующие треки порции греются из ресурса без регистрации', async () => {
            // Треки волны не скачаны — ссылки только из ресурса.
            mocks.downloads.getLocalAudioUrl.mockResolvedValue(null);

            await startTestWave();

            // Текущий (W1) + W2–W5 — весь батч из ресурса,
            // без регистрации в базе.
            await vi.waitFor(() => {
                expect(mocks.getExternalTrackAudioUrl)
                    .toHaveBeenCalledTimes(5);
            });

            // Следующий по свайпу: ссылка в кеше, новых запросов нет.
            await player.playNext();

            expect(mocks.getExternalTrackAudioUrl)
                .toHaveBeenCalledTimes(5);
            expect(player.currentTrack?.title).toBe('W2');
        });
    });

    describe('предзагрузка ссылок', () => {
        afterEach(() => {
            // В остальных тестах getTrackAudio никто не
            // настраивает: убираем свои реализации, чтобы не
            // течь в них (clearAllMocks реализации не снимает).
            mocks.getTrackAudio.mockReset();
            mocks.downloads.getLocalAudioUrl.mockResolvedValue(
                'blob:local-audio',
            );
        });

        it('протухшая по TTL предзагрузка запрашивается заново', async () => {
            mocks.downloads.getLocalAudioUrl.mockResolvedValue(null);

            mocks.playRemoteTrack.mockImplementation(
                async (track: Track) => ({
                    state: {version: 1, current_track: track},
                }),
            );

            // 1 мс — ссылка протухает сразу после предзагрузки.
            mocks.getExternalTrackAudioUrl.mockResolvedValue({
                url: 'blob:external-audio',
                path_ttl_sec: 0.001,
            });

            const tracks = ['A', 'B'].map((title) => {
                const track = makeTrack(title);

                track.source_type = 'yandex_music';
                track.source_id = `ym-${title}`;

                return track;
            });

            player.setQueue(tracks, PlaySourceListsEnum.SEARCH);

            await vi.waitFor(() => {
                expect(mocks.getExternalTrackAudioUrl)
                    .toHaveBeenCalledTimes(2);
            });

            // Дольше TTL — играем: ссылка в кеше протухла,
            // запрос уходит заново.
            await new Promise(resolve => setTimeout(resolve, 20));

            await player.playTrack(
                tracks[0],
                PlaySourceListsEnum.SEARCH,
            );

            await vi.waitFor(() => {
                expect(mocks.getExternalTrackAudioUrl)
                    .toHaveBeenCalledTimes(3);
            });
        });

        it('после восстановления сессии первый клик предзагружает сразу', async () => {
            mocks.downloads.getLocalAudioUrl.mockResolvedValue(null);
            mocks.getTrackAudio.mockResolvedValue({url: 'blob:audio'});

            const restored = makeTrack('Восстановленный');

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
                    is_playing: false,
                    position_seconds: 0,
                    active_device_id: 7,
                    play_source: 'favorites',
                    shuffle_enabled: false,
                    repeat_mode: 'off',
                    current_track: restored,
                    queue: [],
                },
                queue: [],
            });

            await player.initializePlayerDevice();

            // Страница избранного: восстановленный трек есть
            // в списке — очередь сливается, а план был построен
            // по пустой очереди при восстановлении и обязан
            // перестроиться (иначе первый клик греет пустоту).
            const a = makeTrack('A');
            const c = makeTrack('C');
            const d = makeTrack('D');

            player.setQueue(
                [a, restored, c, d],
                PlaySourceListsEnum.FAVORITES,
            );

            // Восстановленный трек + следующие по плану (C, D):
            // ссылки уходят в фон сразу.
            await vi.waitFor(() => {
                expect(mocks.getTrackAudio).toHaveBeenCalledTimes(3);
            });

            const requested = mocks.getTrackAudio.mock.calls
                .map(call => Number(call[0]));

            expect(requested).toEqual(
                [restored, c, d].map(track => Number(track.id)),
            );

            // Клик по восстановленному треку: ссылка уже в кеше,
            // новых запросов не нужно.
            await player.playTrack(
                restored,
                PlaySourceListsEnum.FAVORITES,
            );

            expect(mocks.getTrackAudio).toHaveBeenCalledTimes(3);
        });

        it('после старта трека ссылки следующих по плану запрошены заранее', async () => {
            mocks.downloads.getLocalAudioUrl.mockResolvedValue(null);
            mocks.getTrackAudio.mockResolvedValue({url: 'blob:audio'});

            const tracks = await playList(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

            // Открытие списка + первый запуск: окно A–F в кеше.
            await vi.waitFor(() => {
                expect(mocks.getTrackAudio).toHaveBeenCalledTimes(6);
            });

            const requested = mocks.getTrackAudio.mock.calls
                .map(call => Number(call[0]));

            expect(requested).toEqual(
                [0, 1, 2, 3, 4, 5].map(index => Number(tracks[index].id)),
            );

            // Окно сдвигается: после переключения на B докешируется G.
            await player.playNext();

            await vi.waitFor(() => {
                expect(mocks.getTrackAudio).toHaveBeenCalledTimes(7);
            });

            expect(Number(mocks.getTrackAudio.mock.calls[6][0]))
                .toBe(Number(tracks[6].id));
        });

        it('поиск: внешние треки предзагружаются напрямую из ресурса', async () => {
            mocks.downloads.getLocalAudioUrl.mockResolvedValue(null);
            mocks.getTrackAudio.mockResolvedValue({url: 'blob:audio'});

            const tracks = ['A', 'B', 'C'].map((title) => {
                const track = makeTrack(title);

                track.source_type = 'yandex_music';
                track.source_id = `ym-${title}`;

                return track;
            });

            // Контекст поиска: треки ещё не в базе — ссылки просим
            // у ресурса, /audio по внешним id не дёргаем вообще.
            player.setQueue(tracks, PlaySourceListsEnum.SEARCH);

            await vi.waitFor(() => {
                expect(mocks.getExternalTrackAudioUrl)
                    .toHaveBeenCalledTimes(3);
            });

            expect(mocks.getTrackAudio).not.toHaveBeenCalled();
        });

        it('внешний трек с протухшим file.path идёт в ресурс, не в /audio', async () => {
            mocks.downloads.getLocalAudioUrl.mockResolvedValue(null);
            mocks.getTrackAudio.mockResolvedValue({url: 'blob:audio'});

            const track = makeTrack('Y');

            track.source_type = 'yandex_music';
            track.source_id = 'ym-154955092';
            track.file = {
                id: 1,
                track_id: 1,
                disk: 'local',
                path: 'https://example.com/stale.mp3',
                mime_type: 'audio/mpeg',
                size_bytes: null,
                duration_ms: null,
                sha256: null,
                // Протух по TTL — file.path выше отсёкнут,
                // но запись есть, и /audio по внешнему id
                // работать не будет.
                path_fetch_at: '2020-01-01 00:00:00',
                path_ttl_sec: 3600,
                created_at: '',
                updated_at: '',
            };

            player.setQueue([track], PlaySourceListsEnum.SEARCH);

            await vi.waitFor(() => {
                expect(mocks.getExternalTrackAudioUrl)
                    .toHaveBeenCalledTimes(1);
            });

            expect(mocks.getTrackAudio).not.toHaveBeenCalled();
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
        it('уход в офлайн: очередь бесшовно меняется на скачанное, играющий живёт', async () => {
            await playList(['A', 'B']);

            const downloaded = [makeTrack('D1'), makeTrack('D2')];
            mocks.downloads.listDownloadedTracks.mockResolvedValue(
                downloaded,
            );

            // Сеть пропала посреди прослушивания избранного.
            await whileOffline(async () => {
                await vi.waitFor(() => {
                    expect(player.queue.map(t => t.title))
                        .toEqual(['D1', 'D2']);
                });

                // Играющий трек не тронут — доигрывает.
                expect(player.currentTrack?.title).toBe('A');
            });
        });

        it('уход в офлайн без скачанных: очередь оставляем как есть', async () => {
            const tracks = await playList(['A', 'B']);

            mocks.downloads.listDownloadedTracks.mockResolvedValue([]);

            await whileOffline(async () => {
                await new Promise(resolve => setTimeout(resolve, 30));

                expect(player.queue).toEqual(tracks);
            });
        });

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
        function mockDeviceRestore(track: Track): void {
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
        }

        it('сервер говорит «playing», но звук не пошёл — показываем паузу', async () => {
            const track = makeTrack('Восстановленный');

            mockDeviceRestore(track);

            await player.initializePlayerDevice();

            // Без пользовательского жеста браузер звук не пустил:
            // честная пауза, а не «крутится без звука».
            expect(player.isPlaying).toBe(false);
            expect(player.currentTrack?.title).toBe('Восстановленный');
        });

        it('ссылка восстановленного трека запрашивается сразу', async () => {
            mocks.downloads.getLocalAudioUrl.mockResolvedValue(null);
            mocks.getTrackAudio.mockResolvedValue({url: 'blob:audio'});

            const track = makeTrack('Восстановленный');

            mockDeviceRestore(track);

            await player.initializePlayerDevice();

            // Кеш пуст после перезагрузки: ссылка текущего трека
            // уходит в фон — первый запуск не ждёт запрос.
            await vi.waitFor(() => {
                expect(mocks.getTrackAudio)
                    .toHaveBeenCalledWith(Number(track.id));
            });
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
