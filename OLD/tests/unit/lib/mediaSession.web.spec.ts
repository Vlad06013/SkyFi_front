import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {MediaSessionHandlers} from '@/lib/mediaSession';

/**
 * Веб-ветка src/lib/mediaSession.ts (navigator.mediaSession).
 * Модуль держит состояние (initialized/backend) — каждый тест
 * грузит свежую копию через resetModules + динамический import.
 */

type ActionHandler = (
    details: {seekTime?: number | null; seekOffset?: number | null},
) => void;

interface FakeMediaSession {
    setActionHandler: ReturnType<typeof vi.fn>;
    setPositionState: ReturnType<typeof vi.fn>;
    metadata: unknown;
    playbackState: string;
}

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

function installFakeMediaSession(): {
    fake: FakeMediaSession;
    handlerFor: (action: string) => ActionHandler;
} {
    const handlers = new Map<string, ActionHandler>();

    const fake: FakeMediaSession = {
        setActionHandler: vi.fn(
            (action: string, handler: ActionHandler) => {
                handlers.set(action, handler);
            },
        ),
        setPositionState: vi.fn(),
        metadata: null,
        playbackState: 'none',
    };

    // MediaMetadata в jsdom нет — подставляем совместимый класс.
    (window as Record<string, unknown>).MediaMetadata = class {
        title = '';
        artist = '';
        album = '';
        artwork: unknown[] = [];

        constructor(init: Record<string, unknown>) {
            Object.assign(this, init);
        }
    };

    Object.defineProperty(navigator, 'mediaSession', {
        value: fake,
        configurable: true,
    });

    return {fake, handlerFor: (action) => handlers.get(action)!};
}

async function loadLib() {
    vi.resetModules();

    return await import('@/lib/mediaSession');
}

describe('mediaSession (web-api)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('регистрирует обработчики всех восьми действий', async () => {
        const {fake, handlerFor} = installFakeMediaSession();
        const lib = await loadLib();

        lib.initMediaSession(makeHandlers());

        const actions = [
            'play',
            'pause',
            'stop',
            'previoustrack',
            'nexttrack',
            'seekto',
            'seekbackward',
            'seekforward',
        ];

        for (const action of actions) {
            expect(fake.setActionHandler).toHaveBeenCalledWith(
                action,
                expect.any(Function),
            );
            expect(handlerFor(action)).toBeTypeOf('function');
        }
    });

    it('маршрутизирует действия в переданные обработчики', async () => {
        const {handlerFor} = installFakeMediaSession();
        const lib = await loadLib();
        const handlers = makeHandlers();

        lib.initMediaSession(handlers);

        handlerFor('play')({});
        handlerFor('pause')({});
        handlerFor('stop')({});
        handlerFor('nexttrack')({});
        handlerFor('previoustrack')({});

        expect(handlers.onPlay).toHaveBeenCalledTimes(1);
        expect(handlers.onPause).toHaveBeenCalledTimes(1);
        expect(handlers.onStop).toHaveBeenCalledTimes(1);
        expect(handlers.onNext).toHaveBeenCalledTimes(1);
        expect(handlers.onPrevious).toHaveBeenCalledTimes(1);
    });

    it('повторный init игнорируется: обработчики не перезаписываются', async () => {
        const {handlerFor} = installFakeMediaSession();
        const lib = await loadLib();
        const first = makeHandlers();
        const second = makeHandlers();

        lib.initMediaSession(first);
        lib.initMediaSession(second);

        handlerFor('play')({});

        expect(first.onPlay).toHaveBeenCalledTimes(1);
        expect(second.onPlay).not.toHaveBeenCalled();
    });

    it('ошибка в обработчике действия не роняет вызов', async () => {
        const {handlerFor} = installFakeMediaSession();
        const lib = await loadLib();
        const warn = vi
            .spyOn(console, 'warn')
            .mockImplementation(() => undefined);

        lib.initMediaSession(
            makeHandlers({
                onPlay: vi.fn(() => {
                    throw new Error('бум');
                }),
            }),
        );

        expect(() => handlerFor('play')({})).not.toThrow();
        expect(warn).toHaveBeenCalled();
    });

    it('seekto с валидным временем идёт в onSeekTo, мусор игнорируется', async () => {
        const {handlerFor} = installFakeMediaSession();
        const lib = await loadLib();
        const handlers = makeHandlers();

        lib.initMediaSession(handlers);

        handlerFor('seekto')({seekTime: 42});
        expect(handlers.onSeekTo).toHaveBeenCalledWith(42);

        handlerFor('seekto')({seekTime: -5});
        handlerFor('seekto')({seekTime: null});
        handlerFor('seekto')({});

        expect(handlers.onSeekTo).toHaveBeenCalledTimes(1);
    });

    it('seekbackward/seekforward без офсета используют сдвиг 10 с', async () => {
        const {handlerFor} = installFakeMediaSession();
        const lib = await loadLib();
        const handlers = makeHandlers();

        lib.initMediaSession(handlers);

        handlerFor('seekbackward')({});
        expect(handlers.onSeekBackward).toHaveBeenCalledWith(10);

        handlerFor('seekforward')({});
        expect(handlers.onSeekForward).toHaveBeenCalledWith(10);

        handlerFor('seekforward')({seekOffset: 30});
        expect(handlers.onSeekForward).toHaveBeenCalledWith(30);
    });

    it('playbackState отражает состояние: none / playing / paused', async () => {
        const {fake} = installFakeMediaSession();
        const lib = await loadLib();

        lib.initMediaSession(makeHandlers());

        lib.updateMediaSessionPlaybackState(false, false);
        expect(fake.playbackState).toBe('none');

        lib.updateMediaSessionPlaybackState(true, true);
        expect(fake.playbackState).toBe('playing');

        lib.updateMediaSessionPlaybackState(true, false);
        expect(fake.playbackState).toBe('paused');
    });

    it('метаданные: трек и сброс в null', async () => {
        const {fake} = installFakeMediaSession();
        const lib = await loadLib();

        lib.initMediaSession(makeHandlers());

        lib.updateMediaSessionTrack({
            title: 'Песня',
            artist: 'Группа',
            album: 'Альбом',
            artworkUrl: null,
        });

        const metadata = fake.metadata as {
            title: string;
            artist: string;
            album: string;
        };

        expect(metadata.title).toBe('Песня');
        expect(metadata.artist).toBe('Группа');
        expect(metadata.album).toBe('Альбом');

        lib.updateMediaSessionTrack(null);
        expect(fake.metadata).toBeNull();
    });

    it('setPositionState: позиция передаётся, мусорные длительности игнорируются', async () => {
        const {fake} = installFakeMediaSession();
        const lib = await loadLib();

        lib.initMediaSession(makeHandlers());

        lib.updateMediaSessionPosition(15, 180);
        expect(fake.setPositionState).toHaveBeenCalledWith({
            duration: 180,
            playbackRate: 1,
            position: 15,
        });

        fake.setPositionState.mockClear();

        lib.updateMediaSessionPosition(15, 0);
        lib.updateMediaSessionPosition(Number.NaN, 180);

        expect(fake.setPositionState).not.toHaveBeenCalled();
    });

    it('без navigator.mediaSession всё — тихий no-op', async () => {
        // Важно именно удалить свойство: 'mediaSession' in navigator
        // с undefined-значением всё равно дал бы ветку web-api.
        Reflect.deleteProperty(navigator, 'mediaSession');

        const lib = await loadLib();

        expect(() => {
            lib.initMediaSession(makeHandlers());
            lib.updateMediaSessionPlaybackState(true, true);
            lib.updateMediaSessionPosition(1, 100);
            lib.updateMediaSessionTrack({title: 'x', artist: 'y'});
        }).not.toThrow();
    });
});
