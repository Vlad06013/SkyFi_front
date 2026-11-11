import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';

import {useWave} from '@/views/Wave/wave';
import {PlaySourceListsEnum} from '@/types/PlaySourceListsEnum';
import type {Track} from '@/types/TrackType';

/**
 * Офлайн-режим волны: без сети выдача не запрашивается,
 * очередь собирается из скачанного, старт — только по действию
 * пользователя, порядок/shuffle — как стоят в плеере.
 */

const mocks = vi.hoisted(() => ({
    isOnline: {value: true},
    getWaveTracks: vi.fn(),
    getYandexMusicDeviceAuthStatus: vi.fn(),
    listDownloadedTracks: vi.fn(),
    setQueue: vi.fn(),
    playTrack: vi.fn(),
    startWave: vi.fn(),
    togglePlay: vi.fn(),
}));

vi.mock('@/stores/network', () => ({
    useNetworkStore: () => ({
        get isOnline() {
            return mocks.isOnline.value;
        },
    }),
}));

vi.mock('@/api/wave', () => ({
    getWaveTracks: mocks.getWaveTracks,
    sendWaveFeedback: vi.fn(),
}));

vi.mock('@/api/auth', () => ({
    getYandexMusicDeviceAuthStatus:
        mocks.getYandexMusicDeviceAuthStatus,
}));

vi.mock('@/stores/downloads', () => ({
    useDownloadsStore: () => ({
        listDownloadedTracks: mocks.listDownloadedTracks,
    }),
}));

vi.mock('@/stores/player', () => ({
    default: () => ({
        waveMode: false,
        currentTrack: null,
        isLoading: false,
        isPlaying: false,
        liked: false,
        favoriteLoading: false,
        previewPreviousTrack: null,
        previewNextTrack: null,
        progressPercent: 0,
        setQueue: mocks.setQueue,
        playTrack: mocks.playTrack,
        startWave: mocks.startWave,
        togglePlay: mocks.togglePlay,
        toggleFavorite: vi.fn(),
    }),
}));

function makeTrack(id: number): Track {
    return {
        id,
        title: `Track ${id}`,
        source_type: 'upload',
        source_id: null,
        duration: 180_000,
        duration_ms: 180_000,
        meta: {album: null, artists: [{id: 1, name: 'Tester'}]},
        file: null,
    };
}

describe('wave: офлайн-режим', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        setActivePinia(createPinia());

        mocks.isOnline.value = true;
    });

    it('офлайн: волна не запрашивается, очередь из скачанного', async () => {
        mocks.isOnline.value = false;

        const downloaded = [makeTrack(1), makeTrack(2)];
        mocks.listDownloadedTracks.mockResolvedValue(downloaded);

        const wave = useWave();
        await wave.loadWave();

        expect(mocks.getWaveTracks).not.toHaveBeenCalled();
        expect(mocks.setQueue).toHaveBeenCalledWith(
            downloaded,
            PlaySourceListsEnum.UPLOAD,
        );
        expect(wave.offlineMode.value).toBe(true);
        expect(wave.waveError.value).toBe('');
        expect(wave.waveTracks.value).toEqual(downloaded);
    });

    it('офлайн без скачанных: пустое состояние, очередь не трогаем', async () => {
        mocks.isOnline.value = false;
        mocks.listDownloadedTracks.mockResolvedValue([]);

        const wave = useWave();
        await wave.loadWave();

        expect(mocks.setQueue).not.toHaveBeenCalled();
        expect(wave.offlineMode.value).toBe(true);
        expect(wave.waveTracks.value).toEqual([]);
        expect(wave.waveError.value).toBe('');
    });

    it('playWave офлайн стартует скачанное обычным списком, без waveMode', async () => {
        mocks.isOnline.value = false;

        const downloaded = [makeTrack(1), makeTrack(2)];
        mocks.listDownloadedTracks.mockResolvedValue(downloaded);

        const wave = useWave();
        await wave.loadWave();
        await wave.playWave();

        // Обычный список: shuffle/repeat плеера действуют,
        // wave-режим (который их игнорирует) не включаем.
        expect(mocks.playTrack).toHaveBeenCalledWith(
            downloaded[0],
            PlaySourceListsEnum.UPLOAD,
        );
        expect(mocks.startWave).not.toHaveBeenCalled();
    });

    it('сеть падает во время запроса: тот же офлайн-режим', async () => {
        mocks.getWaveTracks.mockImplementation(async () => {
            mocks.isOnline.value = false;

            throw new Error('Network Error');
        });
        mocks.listDownloadedTracks.mockResolvedValue([makeTrack(7)]);

        const wave = useWave();
        await wave.loadWave();

        expect(wave.offlineMode.value).toBe(true);
        expect(wave.waveError.value).toBe('');
        expect(mocks.setQueue).toHaveBeenCalled();
    });

    it('онлайн: волна запрашивается как раньше', async () => {
        mocks.getWaveTracks.mockResolvedValue([makeTrack(9)]);

        const wave = useWave();
        await wave.loadWave();

        expect(mocks.getWaveTracks).toHaveBeenCalledWith(5);
        expect(wave.offlineMode.value).toBe(false);
        expect(mocks.setQueue).not.toHaveBeenCalled();
    });

    it('«В волну» после офлайна: сначала свежая выдача, не офлайн-очередь', async () => {
        // Были в офлайне: волна встала на скачанное.
        mocks.isOnline.value = false;

        const downloaded = [makeTrack(1), makeTrack(2)];
        mocks.listDownloadedTracks.mockResolvedValue(downloaded);

        const wave = useWave();
        await wave.loadWave();

        expect(wave.offlineMode.value).toBe(true);

        // Сеть вернулась, жмём «В волну»: свежая выдача,
        // скачанное не уходит в старт волны.
        mocks.isOnline.value = true;

        const fresh = [makeTrack(9)];
        mocks.getWaveTracks.mockResolvedValue(fresh);

        await wave.switchToWave();

        expect(mocks.getWaveTracks).toHaveBeenCalledWith(5);
        expect(mocks.startWave).toHaveBeenCalledWith(fresh, 0);
    });
});
