import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {MediaSessionHandlers} from '@/lib/mediaSession';

/**
 * Нативная ветка src/lib/mediaSession.ts (@capgo/capacitor-media-session).
 * Плагин и Capacitor замоканы: платформа всегда нативная,
 * обработчики плагина перехватываем в Map.
 */

type PluginHandler = (details: {
    seekTime?: number | null;
}) => void;

const {plugin, handlers} = vi.hoisted(() => {
    const handlers = new Map<string, PluginHandler>();

    return {
        handlers,
        plugin: {
            MediaSession: {
                setActionHandler: vi.fn(
                    ({action}: {action: string}, handler: PluginHandler) => {
                        handlers.set(action, handler);

                        return Promise.resolve();
                    },
                ),
                setMetadata: vi.fn(() => Promise.resolve()),
                setPlaybackState: vi.fn(() => Promise.resolve()),
                setPositionState: vi.fn(() => Promise.resolve()),
            },
        },
    };
});

vi.mock('@capgo/capacitor-media-session', () => ({
    MediaSession: plugin.MediaSession,
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: {isNativePlatform: () => true},
}));

function makeHandlers(
    overrides: Partial<MediaSessionHandlers> = {},
): MediaSessionHandlers & {
    [K in keyof MediaSessionHandlers]: ReturnType<typeof vi.fn>;
} {
    return {
        onPlay: vi.fn(),
        onPause: vi.fn(),
        onStop: vi.fn(),
        onNext: vi.fn(),
        onPrevious: vi.fn(),
        onSeekBackward: vi.fn(),
        onSeekForward: vi.fn(),
        onSeekTo: vi.fn(),
        ...overrides,
    };
}

async function loadLib() {
    vi.resetModules();

    return await import('@/lib/mediaSession');
}

describe('mediaSession (native-plugin)', () => {
    beforeEach(() => {
        handlers.clear();
        vi.clearAllMocks();
    });

    it('регистрирует обработчики через плагин', async () => {
        const lib = await loadLib();

        lib.initMediaSession(makeHandlers());

        expect(plugin.MediaSession.setActionHandler).toHaveBeenCalledTimes(8);

        for (const action of [
            'play',
            'pause',
            'stop',
            'previoustrack',
            'nexttrack',
            'seekto',
            'seekbackward',
            'seekforward',
        ]) {
            expect(handlers.get(action)).toBeTypeOf('function');
        }
    });

    it('маршрутизирует действия, seekto переводит миллисекунды в секунды', async () => {
        const lib = await loadLib();
        const handlersLocal = makeHandlers();

        lib.initMediaSession(handlersLocal);

        handlers.get('play')!({});
        handlers.get('nexttrack')!({});
        handlers.get('seekto')!({seekTime: 42.5});

        expect(handlersLocal.onPlay).toHaveBeenCalledTimes(1);
        expect(handlersLocal.onNext).toHaveBeenCalledTimes(1);
        expect(handlersLocal.onSeekTo).toHaveBeenCalledWith(42.5);
    });

    it('seekbackward без офсета — сдвиг 10 с', async () => {
        const lib = await loadLib();
        const handlersLocal = makeHandlers();

        lib.initMediaSession(handlersLocal);

        handlers.get('seekbackward')!({});

        expect(handlersLocal.onSeekBackward).toHaveBeenCalledWith(10);
    });

    it('метаданные и сброс идут через плагин', async () => {
        const lib = await loadLib();

        lib.initMediaSession(makeHandlers());

        lib.updateMediaSessionTrack({
            title: 'Песня',
            artist: 'Группа',
            album: null,
            artworkUrl: null,
        });

        expect(plugin.MediaSession.setMetadata).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Песня',
                artist: 'Группа',
            }),
        );

        lib.updateMediaSessionTrack(null);
        expect(plugin.MediaSession.setMetadata).toHaveBeenLastCalledWith({});
    });

    it('состояние воспроизведения через плагин', async () => {
        const lib = await loadLib();

        lib.initMediaSession(makeHandlers());

        lib.updateMediaSessionPlaybackState(true, true);
        expect(plugin.MediaSession.setPlaybackState).toHaveBeenCalledWith({
            playbackState: 'playing',
        });

        lib.updateMediaSessionPlaybackState(true, false);
        expect(plugin.MediaSession.setPlaybackState).toHaveBeenLastCalledWith({
            playbackState: 'paused',
        });

        lib.updateMediaSessionPlaybackState(false, false);
        expect(plugin.MediaSession.setPlaybackState).toHaveBeenLastCalledWith({
            playbackState: 'none',
        });
    });

    it('позиция через плагин; мусорные длительности игнорируются', async () => {
        const lib = await loadLib();

        lib.initMediaSession(makeHandlers());

        lib.updateMediaSessionPosition(20, 200);

        expect(plugin.MediaSession.setPositionState).toHaveBeenCalledWith({
            duration: 200,
            playbackRate: 1,
            position: 20,
        });

        plugin.MediaSession.setPositionState.mockClear();

        lib.updateMediaSessionPosition(20, -1);

        expect(plugin.MediaSession.setPositionState).not.toHaveBeenCalled();
    });
});
