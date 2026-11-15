import {Capacitor} from '@capacitor/core';
import {MediaSession} from '@capgo/capacitor-media-session';

/**
 * Системная медиасессия плеера: метаданные трека в уведомлении
 * и обработка медиакнопок (руль, гарнитура, lockscreen, пульты).
 *
 * На нативных платформах работает через плагин
 * @capgo/capacitor-media-session: Android WebView сам по себе
 * медиакнопки приложению не передаёт, нужен нативный мост
 * к MediaSessionCompat. В браузере — через стандартный
 * Media Session API.
 *
 * Всё здесь — «best effort»: сбой медиасессии не должен
 * влиять на воспроизведение.
 */

export interface MediaSessionTrack {
    title: string;
    artist: string;
    album?: string | null;
    artworkUrl?: string | null;
}

export interface MediaSessionHandlers {
    onPlay(): void;
    onPause(): void;
    onStop(): void;
    onNext(): void;
    onPrevious(): void;
    onSeekBackward(offsetSeconds: number): void;
    onSeekForward(offsetSeconds: number): void;
    onSeekTo(seconds: number): void;
}

/** Сдвиг по умолчанию для seekbackward/seekforward. */
const DEFAULT_SEEK_OFFSET_S = 10;

type MediaSessionBackend = 'native-plugin' | 'web-api' | 'none';

let backend: MediaSessionBackend = 'none';
let initialized = false;
let currentHandlers: MediaSessionHandlers | null = null;

function resolveBackend(): MediaSessionBackend {
    if (Capacitor.isNativePlatform()) {
        return 'native-plugin';
    }

    if (
        typeof navigator !== 'undefined' &&
        'mediaSession' in navigator
    ) {
        return 'web-api';
    }

    return 'none';
}

function callHandler(
    invoke: (handlers: MediaSessionHandlers) => void,
): void {
    if (!currentHandlers) return;

    try {
        invoke(currentHandlers);
    } catch (error) {
        console.warn(
            '[MediaSession] Обработчик действия завершился с ошибкой:',
            error,
        );
    }
}

function handleSeek(
    invoke: (handlers: MediaSessionHandlers, offset: number) => void,
    offsetSeconds?: number | null,
): void {
    const offset =
        Number.isFinite(offsetSeconds) && Number(offsetSeconds) > 0
            ? Number(offsetSeconds)
            : DEFAULT_SEEK_OFFSET_S;

    callHandler((handlers) => invoke(handlers, offset));
}

function warnMediaSessionError(action: string, error: unknown): void {
    console.warn(`[MediaSession] ${action} не выполнено:`, error);
}

/**
 * Однократно зарегистрировать обработчики медиадействий.
 * Повторный вызов игнорируется.
 */
export function initMediaSession(
    handlers: MediaSessionHandlers,
): void {
    if (initialized) return;

    backend = resolveBackend();

    if (backend === 'none') return;

    initialized = true;
    currentHandlers = handlers;

    if (backend === 'native-plugin') {
        const register = (
            action:
                | 'play'
                | 'pause'
                | 'stop'
                | 'previoustrack'
                | 'nexttrack'
                | 'seekto'
                | 'seekbackward'
                | 'seekforward',
            handler: (details: {seekTime?: number | null}) => void,
        ): void => {
            void MediaSession
                .setActionHandler({action}, handler)
                .catch((error: unknown) =>
                    warnMediaSessionError(`setActionHandler(${action})`, error),
                );
        };

        register('play', () => callHandler((h) => h.onPlay()));
        register('pause', () => callHandler((h) => h.onPause()));
        register('stop', () => callHandler((h) => h.onStop()));
        register('previoustrack', () => callHandler((h) => h.onPrevious()));
        register('nexttrack', () => callHandler((h) => h.onNext()));
        register('seekto', (details: {seekTime?: number | null}) =>
            callHandler((h) => {
                const time = Number(details?.seekTime);

                if (Number.isFinite(time) && time >= 0) {
                    h.onSeekTo(time);
                }
            }),
        );
        register('seekbackward', (details: {seekTime?: number | null}) =>
            handleSeek(
                (h, offset) => h.onSeekBackward(offset),
                details?.seekTime,
            ),
        );
        register('seekforward', (details: {seekTime?: number | null}) =>
            handleSeek(
                (h, offset) => h.onSeekForward(offset),
                details?.seekTime,
            ),
        );

        return;
    }

    navigator.mediaSession.setActionHandler('play', () =>
        callHandler((h) => h.onPlay()),
    );

    navigator.mediaSession.setActionHandler('pause', () =>
        callHandler((h) => h.onPause()),
    );

    navigator.mediaSession.setActionHandler('stop', () =>
        callHandler((h) => h.onStop()),
    );

    navigator.mediaSession.setActionHandler('previoustrack', () =>
        callHandler((h) => h.onPrevious()),
    );

    navigator.mediaSession.setActionHandler('nexttrack', () =>
        callHandler((h) => h.onNext()),
    );

    navigator.mediaSession.setActionHandler(
        'seekto',
        (details) => {
            const time = details.seekTime ?? null;

            if (Number.isFinite(time) && time !== null && time >= 0) {
                callHandler((h) => h.onSeekTo(time));
            }
        },
    );

    navigator.mediaSession.setActionHandler(
        'seekbackward',
        (details) =>
            handleSeek(
                (h, offset) => h.onSeekBackward(offset),
                details.seekOffset,
            ),
    );

    navigator.mediaSession.setActionHandler(
        'seekforward',
        (details) =>
            handleSeek(
                (h, offset) => h.onSeekForward(offset),
                details.seekOffset,
            ),
    );
}

/**
 * Обновить метаданные «сейчас играет».
 * null — сбросить (ничего не играет).
 */
export function updateMediaSessionTrack(
    track: MediaSessionTrack | null,
): void {
    if (backend === 'none') return;

    if (!track) {
        if (backend === 'native-plugin') {
            void MediaSession
                .setMetadata({})
                .catch((error: unknown) =>
                    warnMediaSessionError('setMetadata', error),
                );
        } else {
            navigator.mediaSession.metadata = null;
        }

        return;
    }

    const artwork = track.artworkUrl
        ? [
              {
                  src: track.artworkUrl,
                  sizes: '512x512',
                  type: 'image/jpeg',
              },
          ]
        : [];

    if (backend === 'native-plugin') {
        void MediaSession
            .setMetadata({
                title: track.title,
                artist: track.artist,
                album: track.album ?? '',
                artwork,
            })
            .catch((error: unknown) =>
                warnMediaSessionError('setMetadata', error),
            );

        return;
    }

    try {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist,
            album: track.album ?? '',
            artwork,
        });
    } catch (error) {
        warnMediaSessionError('metadata', error);
    }
}

/** Отразить состояние: трек есть/нет, играет/на паузе. */
export function updateMediaSessionPlaybackState(
    hasTrack: boolean,
    isPlaying: boolean,
): void {
    if (backend === 'none') return;

    const playbackState = !hasTrack
        ? 'none'
        : isPlaying
          ? 'playing'
          : 'paused';

    if (backend === 'native-plugin') {
        void MediaSession
            .setPlaybackState({playbackState})
            .catch((error: unknown) =>
                warnMediaSessionError('setPlaybackState', error),
            );

        return;
    }

    navigator.mediaSession.playbackState = playbackState;
}

/**
 * Обновить позицию (ползунок в уведомлении).
 * Без валидной длительности ничего не делает.
 */
export function updateMediaSessionPosition(
    positionSeconds: number,
    durationSeconds: number,
): void {
    if (backend === 'none') return;

    if (
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0 ||
        !Number.isFinite(positionSeconds)
    ) {
        return;
    }

    const position = Math.max(
        0,
        Math.min(positionSeconds, durationSeconds),
    );

    if (backend === 'native-plugin') {
        void MediaSession
            .setPositionState({
                duration: durationSeconds,
                playbackRate: 1,
                position,
            })
            .catch((error: unknown) =>
                warnMediaSessionError('setPositionState', error),
            );

        return;
    }

    try {
        navigator.mediaSession.setPositionState({
            duration: durationSeconds,
            playbackRate: 1,
            position,
        });
    } catch (error) {
        warnMediaSessionError('setPositionState', error);
    }
}
