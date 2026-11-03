import {computed, ref, watch} from 'vue';
import {defineStore} from 'pinia';
import {toastController} from '@ionic/vue';
import echo from '@/lib/echo';
import {useAuthStore} from '@/stores/auth';

import {
    type PlaybackState,
    type PlayerDevice,
    type PlayerDeviceType,
} from '@/types/PlayerType';

import {PlaySourceListsEnum} from '@/types/PlaySourceListsEnum';

import {isAudioUrlFresh, parseServerDate} from '@/lib/audioUrlTtl';

import {
    getWaveTracks,
    sendWaveFeedback,
    type WaveFeedbackType,
} from '@/api/wave';

import {type Track} from '@/types/TrackType';

import {
    getTrackAudio,
    getPlayerState,
    playRemoteTrack,
    pauseRemotePlayback,
    resumeRemotePlayback,
    seekRemotePlayback,
    updatePlaybackOptions,
    getPlayerDevices,
    registerPlayerDevice,
    activatePlayerDevice,
    sendPlayerHeartbeat,
} from '@/api/player';

import {
    addTrackToQueue,
    getPlayerQueue,
    reorderPlayerQueue,
    updateQueueItemStatus,
} from '@/api/queue';

import type {PlaybackQueueItem} from '@/types/QueueType';

import {
    addFavorite,
    removeFavorite,
    checkFavorite
} from '@/api/favorites';


const usePlayerStore = defineStore('player', () => {
    type PlayerTrack = {
        id: number | string;
        title: string;
        artist: string;
        cover?: string;
        symbol?: string;
        /** URL обложки из meta альбома, если есть. */
        coverPath?: string | null;
        /** Название альбома из meta, если есть. */
        albumTitle?: string | null;
        source_id: string | null;
        source_type: string;
    };

    const auth = useAuthStore();

    const devices = ref<PlayerDevice[]>([]);
    const localDeviceId = ref<number | null>(null);
    const activeDeviceId = ref<number | null>(null);
    const isDevicesLoading = ref(false);
    const deviceSwitchLoading = ref(false);

    /** Когда этот клиент в последний раз удачно стучался heartbeat-ом. */
    const lastOwnHeartbeatAt = ref(Date.now());

    const playbackState = ref<PlaybackState | null>(null);
    const queue = ref<Track[]>([]);
    const serverQueue = ref<PlaybackQueueItem[]>([]);
    const currentTrackIndex = ref(-1);
    const currentTrack = ref<PlayerTrack | null>(null);

    /** Полный трек текущего воспроизведения (с meta и source_id) —
     *  нужен для запросов по единому контракту (избранное). */
    const currentSourceTrack = ref<Track | null>(null);

    /** Режим «Моя Волна»: очередь собрана из волны Яндекса,
     *  реакции уходят в ротацию. */
    const waveMode = ref(false);

    let waveTrackKeys = new Set<string>();

    let waveContinuing = false;

    /** Якорь цепочки Яндекса: id первого трека последней
     *  порции. Передаётся как queue при подгрузке новых. */
    let waveAnchor: string | null = null;

    let wavePrefetching = false;

    /** Список страницы, ожидающий явного запуска, пока
     *  играет волна (см. setQueue). */
    let pendingSourceList: {
        tracks: Track[];
        source: PlaySourceListsEnum | null;
    } | null = null;

    /** Список-источник, из которого запущен текущий трек.
     *  null, пока источник неизвестен: заполняется из play_source
     *  серверного состояния или при запуске трека из списка. */
    const playSource = ref<PlaySourceListsEnum | null>(null);

    const isPlaying = ref(false);
    const isLoading = ref(false);
    const progress = ref(0);
    const audioDuration = ref(0);
    const volume = ref(70);
    const liked = ref(false);
    const isShuffleEnabled = ref(false);
    const repeatMode = ref<'off' | 'all' | 'one'>('off');
    const favoriteLoading = ref(false);
    const isSeeking = ref(false);
    const isRestoringState = ref(false);
    const serverQueueCount = ref(0);
    const isServerSyncEnabled = computed(() => Boolean(auth.user));

    const isLocalDeviceActive = computed(
        () =>
            localDeviceId.value !== null &&
            activeDeviceId.value === localDeviceId.value,
    );

    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = volume.value / 100;

    function generateUuid(): string {
        if (typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }

        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;

        const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));

        return (
            hex.slice(0, 4).join('') +
            '-' +
            hex.slice(4, 6).join('') +
            '-' +
            hex.slice(6, 8).join('') +
            '-' +
            hex.slice(8, 10).join('') +
            '-' +
            hex.slice(10, 16).join('')
        );
    }

    function createCommandId(): string {
        return generateUuid();
    }

    watch(volume, (value) => {
        audio.volume = Math.max(0, Math.min(100, value)) / 100;
    });

    let playbackRequestId = 0;
    let restoreRequestId = 0;
    let remoteStateRequestId = 0;
    let favoriteCheckRequestId = 0;
    let favoriteToggleRequestId = 0;

    /** ID играющего сейчас элемента серверной очереди (если трек из неё). */
    let currentQueueItemId: number | null = null;

    /** Порядок индексов при перемешивании и текущая позиция в нём. */
    let shuffleOrder: number[] = [];
    let shuffleCursor = -1;

    /** Кеш полученных через /tracks/{id}/audio ссылок (на время сессии).
     *  fetchedAt — когда ссылка получена, для проверки по TTL источника. */
    const audioUrlCache = new Map<
        number,
        { url: string; fetchedAt: number }
    >();

    let deviceInitializationPromise: Promise<void> | null = null;
    let isDeviceChangesSubscribed = false;
    /** Канал Echo, на который оформлена текущая подписка. */
    let subscribedChannelName: string | null = null;
    let deviceHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let serverProgressTimer: ReturnType<typeof setInterval> | null = null;
    let lastAppliedVersion: number | null = null;

    function setServerQueueCount(count: number): void {
        serverQueueCount.value = count;
    }

    // ============================================
    // УВЕДОМЛЕНИЯ
    // ============================================

    async function showPlayerToast(message: string): Promise<void> {
        const toast = await toastController.create({
            message,
            duration: 4000,
            position: 'top',
            cssClass: 'player-toast',
        });

        await toast.present();
    }

    function getTrackArtistLine(track: Track): string {
        const artists =
            track.meta?.artists?.map((artist) => artist.name).join(', ');

        return artists || 'Неизвестный исполнитель';
    }

    // ============================================
    // HEARTBEAT УСТРОЙСТВА
    //
    // Фронт периодически отмечает устройство активным,
    // чтобы бэкенд и другие клиенты видели, какие
    // устройства онлайн. На закрытии вкладки —
    // последний keepalive-запрос через pagehide.
    // ============================================

    const DEVICE_HEARTBEAT_INTERVAL_MS = 45_000;

    /** Устройство онлайн, если heartbeat был не позже этого порога. */
    const DEVICE_ONLINE_THRESHOLD_MS = 90_000;

    function isDeviceOnline(device: PlayerDevice): boolean {
        // Свою метку знаем локально — серверный last_seen_at в списке
        // для своего устройства всегда немного отстаёт.
        if (device.id === localDeviceId.value) {
            return (
                Date.now() - lastOwnHeartbeatAt.value <
                DEVICE_ONLINE_THRESHOLD_MS
            );
        }

        if (!device.last_seen_at) return false;

        const lastSeenAt = new Date(device.last_seen_at).getTime();

        if (!Number.isFinite(lastSeenAt)) return false;

        return (
            Date.now() - lastSeenAt < DEVICE_ONLINE_THRESHOLD_MS
        );
    }

    let heartbeatTickCount = 0;

    async function beatDeviceHeart(): Promise<void> {
        if (!auth.user) return;

        try {
            await sendPlayerHeartbeat(getDeviceUuid());
        } catch (error) {
            console.warn('[Player] Heartbeat не отправлен:', error);
            return;
        }

        lastOwnHeartbeatAt.value = Date.now();

        // Свежую мету сразу отражаем в своей записи списка.
        devices.value = devices.value.map((device) =>
            device.id === localDeviceId.value
                ? {...device, last_seen_at: new Date().toISOString()}
                : device,
        );

        // Раз в несколько ударов подтягиваем список устройств —
        // чтобы чужие last_seen_at обновлялись и бейджи онлайна
        // не требовали перезагрузки страницы.
        heartbeatTickCount += 1;

        if (heartbeatTickCount % 4 !== 0) return;

        try {
            const response = await getPlayerDevices();
            devices.value = response.data;
        } catch (error) {
            console.warn(
                '[Player] Не удалось обновить список устройств:',
                error,
            );
        }
    }

    function stopDeviceHeartbeat(): void {
        if (deviceHeartbeatTimer !== null) {
            clearInterval(deviceHeartbeatTimer);
            deviceHeartbeatTimer = null;
        }
    }

    function startDeviceHeartbeat(): void {
        stopDeviceHeartbeat();

        if (!auth.user) return;

        heartbeatTickCount = 0;
        lastOwnHeartbeatAt.value = Date.now();

        deviceHeartbeatTimer = setInterval(() => {
            void beatDeviceHeart();
        }, DEVICE_HEARTBEAT_INTERVAL_MS);
    }

    window.addEventListener('pagehide', () => {
        if (!auth.user) return;

        const token = localStorage.getItem('skyfi_token');

        void fetch(
            `${import.meta.env.VITE_API_URL}player/devices/heartbeat`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token
                        ? {Authorization: `Bearer ${token}`}
                        : {}),
                },
                body: JSON.stringify({device_uuid: getDeviceUuid()}),
                keepalive: true,
            },
        ).catch(() => undefined);
    });

    // ============================================
    // ПРОГРЕСС ВОСПРОИЗВЕДЕНИЯ
    // ============================================

    function stopServerProgressTimer(): void {
        if (serverProgressTimer !== null) {
            clearInterval(serverProgressTimer);
            serverProgressTimer = null;
        }
    }

    /** Как часто активное устройство отдаёт реальную позицию на сервер. */
    const POSITION_SYNC_INTERVAL_S = 10;

    let positionSyncAccum = 0;

    function startServerProgressTimer(): void {
        stopServerProgressTimer();

        if (!isPlaying.value) {
            return;
        }

        let lastTick = Date.now();
        positionSyncAccum = 0;


        serverProgressTimer = setInterval(() => {
            if (!isPlaying.value || isSeeking.value) {
                lastTick = Date.now();
                return;
            }

            const now = Date.now();
            const elapsed = (now - lastTick) / 1000;
            lastTick = now;

            if (isLocalDeviceActive.value) {
                if (!audio.paused && Number.isFinite(audio.currentTime)) {
                    progress.value = audio.currentTime;
                }

                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                    audioDuration.value = audio.duration;
                }

                // Периодически отдаём реальную позицию на сервер:
                // остальные устройства подтягивают к ней свои
                // прогресс-бары, а сервер хранит точную позицию
                // для восстановления после перезагрузки.
                positionSyncAccum += elapsed;

                if (positionSyncAccum >= POSITION_SYNC_INTERVAL_S) {
                    positionSyncAccum = 0;
                    reportSeek(audio.currentTime || progress.value);
                }

                return;
            }

            let nextProgress = Math.max(0, progress.value + elapsed);

            if (
                audioDuration.value > 0 &&
                nextProgress > audioDuration.value
            ) {
                nextProgress = audioDuration.value;
            }

            if (progress.value > 0 && nextProgress === 0) {
                console.trace('[Player] Прогресс неожиданно сброшен');
            }

            progress.value = nextProgress;
        }, 250);

    }

    function updateServerProgress(state: PlaybackState): void {

        if (isSeeking.value) {
            return;
        }

        const serverPosition = Math.max(
            0,
            Number(state.position_seconds) || 0,
        );
        if (!state.is_playing) {
            progress.value = serverPosition;
            stopServerProgressTimer();
            return;
        }

        if (isLocalDeviceActive.value) {
            if (
                !audio.paused &&
                Number.isFinite(audio.currentTime) &&
                Math.abs(audio.currentTime - serverPosition) > 3
            ) {
                audio.currentTime = Math.min(
                    serverPosition,
                    audio.duration || serverPosition,
                );
            }

            if (audio.paused) {
                progress.value = serverPosition;
            }
        } else {

            // При каждом новом серверном состоянии принимаем
            // актуальную позицию, в том числе после перемотки.
            progress.value = serverPosition;

        }

        startServerProgressTimer();
    }

    // ============================================
    // ОЧЕРЕДЬ
    // ============================================

    /**
     * Заполнение списка-источника каталогом.
     *
     * Страницы шлют свой список при монтировании. Пока играет
     * волна, чужой список её не вытесняет — запоминаем его
     * и применим, когда из него явно запустят трек (playTrack).
     */
    function setQueue(
        tracks: Track[],
        source: PlaySourceListsEnum | null = null,
    ): void {
        if (waveMode.value) {
            pendingSourceList = { tracks: [...tracks], source };

            return;
        }

        applySourceQueue(tracks, source);
    }

    function applySourceQueue(
        tracks: Track[],
        source: PlaySourceListsEnum | null,
    ): void {
        // Любой список страницы вытесняет волну: дальше
        // следующий/предыдущий работают по его очереди.
        exitWaveMode();

        queue.value = [...tracks];

        currentTrackIndex.value = currentTrack.value
            ? queue.value.findIndex(
                track =>
                    String(track.id) === String(currentTrack.value?.id),
            )
            : -1;

        if (source) {
            playSource.value = source;
        }

        if (isShuffleEnabled.value) {
            rebuildShuffleOrder();
        }
    }

    /**
     * Добавление трека в очередь (серверную)
     * @param track
     */
    async function addToQueue(track: Track): Promise<void> {
        if (!auth.user) {
            throw new Error('Для добавления в очередь необходимо войти в аккаунт.');
        }

        try {
            // Ответ уже содержит очередь целиком —
            // отдельно запрашивать её не нужно.
            const items = await addTrackToQueue(
                track,
                createSyncMeta(),
            );

            serverQueue.value = items;
            setServerQueueCount(items.length);

            void showPlayerToast(
                `В очередь добавлено: ${track.title} — ${getTrackArtistLine(track)}`,
            );
        } catch (error) {
            console.error(
                '[Player] Не удалось добавить трек в очередь:',
                error,
            );

            throw error;
        }
    }

    /**
     * Подтянуть очередь с сервера (после событий сокета).
     */
    async function refreshServerQueue(): Promise<void> {
        if (!auth.user) return;

        try {
            const items = await getPlayerQueue();

            serverQueue.value = items;
            setServerQueueCount(items.length);
        } catch (error) {
            console.warn(
                '[Player] Не удалось обновить очередь:',
                error,
            );
        }
    }

    function findTrackIndex(track: Track): number {
        return queue.value.findIndex(
            (item) => String(item.id) === String(track.id),
        );
    }

    function mapPlaybackTrack(track: Track): PlayerTrack {
        const artists =
            track.meta?.artists
                ?.map((artist) => artist.name)
                .join(', ') || '';

        return {
            id: track.id,
            title: track.title,
            artist: artists || 'Неизвестный исполнитель',
            cover: 'cover-purple',
            symbol: '♫',
            coverPath: track.meta?.album?.cover_path ?? null,
            albumTitle: track.meta?.album?.title ?? null,
            source_id: track.source_id,
            source_type: track.source_type,
        };
    }

    function getTrackDuration(track: Track): number {
        // Длительность меньше секунды считаем отсутствующей:
        // раньше в meta попадал boolean (1 мс) — такие записи
        // бэкенд подлечивает при повторном запуске трека.
        const saneMs = (value: number): boolean =>
            Number.isFinite(value) && value >= 1000;

        const fromFile = Number(track.file?.duration_ms);

        if (saneMs(fromFile)) {
            return fromFile / 1000;
        }

        // Длительность на верхнем уровне трека (состояние плеера):
        // у внешних треков file может отсутствовать целиком.
        const fromState = Number(track.duration_ms);

        if (saneMs(fromState)) {
            return fromState / 1000;
        }

        const fromResource = Number(track.duration);

        if (saneMs(fromResource)) {
            return fromResource / 1000;
        }

        return 0;
    }

    // ============================================
    // ЛОКАЛЬНОЕ ЯДРО ВОСПРОИЗВЕДЕНИЯ
    //
    // Команды применяются к <audio> мгновенно, серверу об
    // изменениях сообщаем в фоне — он служит журналом для
    // других устройств, а не исполнителем команд.
    // ============================================

    /**
     * Фоновая задача синхронизации: ошибки только в консоль,
     * на воспроизведение не влияют.
     */
    function backgroundSync(
        task: () => Promise<unknown>,
        label: string,
    ): void {
        if (!auth.user) return;

        void task().catch((error: unknown) => {
            console.warn(
                `[Player] Фоновая синхронизация (${label}) не удалась:`,
                error,
            );
        });
    }

    function createSyncMeta(): {
        origin_device_id: number | null;
        command_id: string;
    } {
        return {
            origin_device_id: localDeviceId.value,
            command_id: createCommandId(),
        };
    }

    /**
     * Ссылка на аудио.
     *
     * 1) Кеш текущей сессии (если запись не протухла по TTL файла).
     * 2) file.path — бэкенд всегда подставляет туда прямую ссылку
     *    на аудиофайл, /audio не нужен. Берём её только пока она
     *    свежая (path_fetch_at + path_ttl_sec приходят с бэка).
     * 3) Иначе — запрос /tracks/{id}/audio.
     *
     * forceFresh — пропустить кеш и file.path и запросить
     * ссылку заново (повторная попытка после ошибки воспроизведения).
     */
    async function resolveAudioUrl(
        track: Track,
        forceFresh = false,
    ): Promise<string> {
        const trackId = Number(track.id);
        const ttlSec = track.file?.path_ttl_sec ?? null;

        if (!forceFresh) {
            const cached = audioUrlCache.get(trackId);

            if (
                cached &&
                isAudioUrlFresh(cached.fetchedAt, ttlSec)
            ) {
                return cached.url;
            }

            const file = track.file;

            if (
                typeof file?.path === 'string' &&
                file.path.length > 0 &&
                isAudioUrlFresh(file.path_fetch_at, ttlSec)
            ) {
                audioUrlCache.set(trackId, {
                    url: file.path,
                    fetchedAt: file.path_fetch_at
                        ? parseServerDate(file.path_fetch_at)
                        : Date.now(),
                });

                return file.path;
            }
        }

        const audioFile = await getTrackAudio(trackId);

        if (!audioFile.url) {
            throw new Error('API не вернул ссылку на аудиофайл.');
        }

        audioUrlCache.set(trackId, {
            url: audioFile.url,
            fetchedAt: Date.now(),
        });

        return audioFile.url;
    }

    /**
     * Дождаться загрузки метаданных аудио (с таймаутом).
     *
     * После 'error' даём короткую передышку: Chromium может кинуть
     * ошибку только что прерванной предыдущей загрузки (code 4),
     * а реальная загрузка при этом продолжается и завершится
     * 'loadedmetadata'. Если за передышку метаданные не пришли —
     * считаем ошибку настоящей.
     */
    function waitForAudioMetadata(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let settled = false;
            let errorGraceTimer: ReturnType<typeof setTimeout> | null =
                null;

            const cleanup = (): void => {
                clearTimeout(timeout);

                if (errorGraceTimer !== null) {
                    clearTimeout(errorGraceTimer);
                    errorGraceTimer = null;
                }

                audio.removeEventListener(
                    'loadedmetadata',
                    onLoadedMetadata,
                );

                audio.removeEventListener('error', onError);
            };

            const finish = (error?: Error): void => {
                if (settled) return;

                settled = true;
                cleanup();

                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            };

            const onLoadedMetadata = (): void => finish();

            const onError = (): void => {
                if (settled || errorGraceTimer !== null) {
                    return;
                }

                errorGraceTimer = setTimeout(() => {
                    finish(
                        new Error('Не удалось загрузить аудиофайл.'),
                    );
                }, 500);
            };

            const timeout = setTimeout(() => {
                finish(new Error('Истекло время загрузки аудио.'));
            }, 15000);

            audio.addEventListener('loadedmetadata', onLoadedMetadata);
            audio.addEventListener('error', onError);

            if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
                finish();
            }
        });
    }

    /**
     * Локальный запуск трека: состояние меняем сразу,
     * позицию и автостарт контролирует вызывающий код.
     *
     * Возвращает true, если трек готов к воспроизведению.
     */
    async function startLocalTrack(
        track: Track,
        options: {
            position?: number;
            autoplay?: boolean;
            queueItemId?: number | null;
        } = {},
    ): Promise<boolean> {
        isLoading.value = true;

        try {
            const started = await startLocalTrackOnce(track, options);

            if (started) {
                // Волна: следим за буфером, подгружаем порцию заранее.
                void ensureWaveBuffer();

                return true;
            }

            // Ссылка могла умереть, даже если по TTL она «свежая»
            // (её могли получить за минуту до протухания) — выбрасываем
            // её из кеша и запрашиваем новую через /audio один раз.
            if (audioUrlCache.delete(Number(track.id))) {
                return await startLocalTrackOnce(track, options, true);
            }

            return false;
        } finally {
            isLoading.value = false;
        }
    }

    async function startLocalTrackOnce(
        track: Track,
        options: {
            position?: number;
            autoplay?: boolean;
            queueItemId?: number | null;
        },
        forceFreshUrl = false,
    ): Promise<boolean> {
        const requestId = ++playbackRequestId;

        currentQueueItemId = options.queueItemId ?? null;
        currentTrack.value = mapPlaybackTrack(track);
        currentSourceTrack.value = track;
        currentTrackIndex.value = findTrackIndex(track);
        audioDuration.value = getTrackDuration(track);

        // liked перезапросится через watch на смену трека.
        try {
            const url = await resolveAudioUrl(track, forceFreshUrl);

            if (requestId !== playbackRequestId) {
                return false;
            }

            audio.pause();
            audio.src = url;
            audio.load();

            await waitForAudioMetadata();

            if (requestId !== playbackRequestId) {
                return false;
            }

            const position = Math.max(0, options.position ?? 0);

            if (position > 0) {
                audio.currentTime = Number.isFinite(audio.duration)
                    ? Math.min(position, audio.duration)
                    : position;

                progress.value = position;
            } else {
                progress.value = 0;
            }

            if (options.autoplay ?? true) {
                await audio.play();
            }

            return true;
        } catch (error) {
            console.error(
                '[Player] Не удалось запустить трек локально:',
                error,
            );

            return false;
        }
    }

    /**
     * Сообщить серверу, что сейчас играет этот трек.
     * Сервер обновит состояние и разошлёт его другим устройствам.
     */
    function reportTrackStarted(
        track: Track,
        position: number,
        source: PlaySourceListsEnum,
    ): void {
        backgroundSync(async () => {
            const response = await playRemoteTrack(
                track,
                source,
                createSyncMeta(),
            );

            const version = Number(response?.state?.version);

            if (Number.isFinite(version)) {
                lastAppliedVersion = version;
            }

            if (position > 0) {
                await seekRemotePlayback(
                    position,
                    createSyncMeta(),
                );
            }
        }, 'play');
    }

    function reportPause(): void {
        backgroundSync(() =>
            pauseRemotePlayback(
                Math.max(0, audio.currentTime || progress.value),
                createSyncMeta(),
            ),
        'pause');
    }

    function reportResume(): void {
        backgroundSync(
            () => resumeRemotePlayback(createSyncMeta()),
            'resume',
        );
    }

    function reportSeek(positionSeconds: number): void {
        backgroundSync(
            () =>
                seekRemotePlayback(
                    Math.max(0, Math.floor(positionSeconds)),
                    createSyncMeta(),
                ),
            'seek',
        );
    }

    function reportOptions(): void {
        backgroundSync(
            () =>
                updatePlaybackOptions(
                    {
                        repeat_mode: repeatMode.value,
                        shuffle_enabled: isShuffleEnabled.value,
                    },
                    createSyncMeta(),
                ),
            'options',
        );
    }

    function reportQueueStatus(
        queueItemId: number,
        status: 'pending' | 'playing_now' | 'played' | 'skipped',
    ): void {
        backgroundSync(
            () => updateQueueItemStatus(queueItemId, status),
            'queue-status',
        );
    }

    /**
     * Завершить играющий элемент серверной очереди:
     * played — если трек доиграл, skipped — если переключили.
     */
    function finalizeCurrentQueueItem(
        outcome: 'played' | 'skipped',
    ): void {
        if (currentQueueItemId === null) return;

        reportQueueStatus(currentQueueItemId, outcome);

        currentQueueItemId = null;
    }

    // ============================================
    // СЕРВЕРНАЯ ОЧЕРЕДЬ (В ПРИОРИТЕТЕ)
    // ============================================

    /**
     * Ближайший ожидающий элемент серверной очереди.
     */
    function getPendingQueueItem(): PlaybackQueueItem | null {
        const pending = serverQueue.value
            .filter(item => item.status === 'pending')
            .sort((a, b) => a.position - b.position);

        return pending[0] ?? null;
    }

    /**
     * Извлечь ближайший ожидающий элемент из локальной копии очереди.
     */
    function takeNextFromQueue(): PlaybackQueueItem | null {
        const item = getPendingQueueItem();

        if (!item) return null;

        serverQueue.value = serverQueue.value.filter(
            queueItem => queueItem.id !== item.id,
        );

        return item;
    }

    async function playQueueItem(item: PlaybackQueueItem): Promise<void> {
        // Прежний играющий элемент завершаем: новый займёт его место.
        // Без этого старый остаётся playing_now на сервере навсегда.
        finalizeCurrentQueueItem('skipped');

        const started = await startLocalTrack(item.track, {
            queueItemId: item.id,
        });

        if (!started) return;

        reportTrackStarted(item.track, 0, PlaySourceListsEnum.QUEUE);
        reportQueueStatus(item.id, 'playing_now');
    }

    /**
     * Клик по треку в очереди: элемент играет сразу.
     * Очередь — отдельный источник: волну покидаем.
     */
    async function playServerQueueItem(
        item: PlaybackQueueItem,
    ): Promise<void> {
        if (!auth.user || isLoading.value) return;

        serverQueue.value = serverQueue.value.filter(
            queueItem => queueItem.id !== item.id,
        );

        exitWaveMode();
        playSource.value = PlaySourceListsEnum.QUEUE;

        await playQueueItem(item);
    }

    // ============================================
    // ПЕРЕМЕШИВАНИЕ
    // ============================================

    function rebuildShuffleOrder(): void {
        const total = queue.value.length;
        const current = currentTrackIndex.value;

        const indices: number[] = [];

        for (let index = 0; index < total; index++) {
            if (index !== current) {
                indices.push(index);
            }
        }

        // Перемешивание Фишера—Йейтса.
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));

            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        shuffleOrder = indices;
        shuffleCursor = -1;
    }

    /**
     * Следующий индекс списка-источника с учётом shuffle/repeat.
     * -1 — воспроизведение дальше невозможно.
     */
    function resolveNextIndex(): number {
        const total = queue.value.length;

        if (total === 0) return -1;

        if (isShuffleEnabled.value) {
            if (shuffleOrder.length === 0) {
                rebuildShuffleOrder();
            }

            shuffleCursor++;

            if (shuffleCursor >= shuffleOrder.length) {
                if (repeatMode.value !== 'all') {
                    return -1;
                }

                shuffleCursor = 0;
            }

            return shuffleOrder[shuffleCursor];
        }

        const current = currentTrackIndex.value;

        if (current < 0) return 0;

        const next = current + 1;

        if (next < total) return next;

        return repeatMode.value === 'all' ? 0 : -1;
    }

    /**
     * Предыдущий индекс списка-источника с учётом shuffle/repeat.
     * -1 — переключаться некуда, достаточно перемотать в начало.
     */
    function resolvePreviousIndex(): number {
        const total = queue.value.length;

        if (total === 0) return -1;

        if (isShuffleEnabled.value) {
            if (shuffleCursor > 0) {
                shuffleCursor--;

                return shuffleOrder[shuffleCursor];
            }

            return -1;
        }

        const current = currentTrackIndex.value;

        if (current < 0) return total - 1;

        if (current > 0) return current - 1;

        return repeatMode.value === 'all' ? total - 1 : -1;
    }

    // ============================================
    // МОЯ ВОЛНА
    // ============================================

    function waveKey(track: Track): string {
        return `${track.source_type}:${track.source_id ?? track.id}`;
    }

    function exitWaveMode(): void {
        waveMode.value = false;
        waveTrackKeys = new Set();
        waveAnchor = null;
    }

    /**
     * Отправить реакцию в волну, если трек из неё.
     * Fire-and-forget: воспроизведение не блокируем.
     * seconds — сколько реально прослушано (для trackFinished).
     */
    function reportWave(
        type: WaveFeedbackType,
        track?: Track,
        seconds?: number,
    ): void {
        const target = track ?? currentSourceTrack.value;

        if (!waveMode.value || !target) return;

        if (!waveTrackKeys.has(waveKey(target))) return;

        void sendWaveFeedback(
            target.source_id ?? target.id,
            type,
            undefined,
            seconds,
        ).catch((error) => {
            console.warn(
                '[Player] Реакция волны не отправлена:',
                error,
            );
        });
    }

    /**
     * Запустить «Мою Волну»: порция треков из Яндекса становится
     * очередью плеера. Треки можно передать снаружи (главная
     * страница уже подгрузила их для показа), иначе запрашиваем
     * свежую порцию. startIndex — с какого трека начать.
     */
    async function startWave(
        tracks?: Track[],
        startIndex = 0,
    ): Promise<boolean> {
        if (!auth.user || isLoading.value) return false;

        try {
            tracks ??= await getWaveTracks(20);

            if (tracks.length === 0) {
                return false;
            }

            const index = Math.min(
                Math.max(startIndex, 0),
                tracks.length - 1,
            );

            waveTrackKeys = new Set(tracks.map(waveKey));
            waveMode.value = true;
            pendingSourceList = null;
            rememberWaveAnchor(tracks);

            queue.value = [...tracks];
            currentTrackIndex.value = index;
            shuffleOrder = [];
            shuffleCursor = -1;

            await playTrack(
                tracks[index],
                PlaySourceListsEnum.YANDEX_WAVE,
            );

            return true;
        } catch (error) {
            exitWaveMode();
            console.error(
                '[Player] Не удалось запустить волну:',
                error,
            );
            return false;
        }
    }

    /** Якорь цепочки = внешний id первого трека последней порции. */
    function rememberWaveAnchor(tracks: Track[]): void {
        const first = tracks[0];

        if (!first) return;

        waveAnchor = String(first.source_id ?? first.id);
    }

    /**
     * Подгрузить следующую порцию волны.
     * Возвращает только треки, которых ещё нет в очереди.
     */
    async function fetchWaveBatch(): Promise<Track[]> {
        const tracks = await getWaveTracks(20, waveAnchor);

        rememberWaveAnchor(tracks);

        return tracks.filter(
            track => !waveTrackKeys.has(waveKey(track)),
        );
    }

    /**
     * Буфер волны: когда до конца очереди остаётся мало треков,
     * подгружаем следующую порцию заранее, в фоне, чтобы
     * переключение не ждало запроса к Яндексу.
     */
    async function ensureWaveBuffer(): Promise<void> {
        if (!auth.user || !waveMode.value) return;

        if (wavePrefetching || waveContinuing) return;

        const remaining =
            queue.value.length - currentTrackIndex.value - 1;

        if (currentTrackIndex.value >= 0 && remaining > 3) return;

        wavePrefetching = true;

        try {
            const fresh = await fetchWaveBatch();

            if (fresh.length === 0) return;

            fresh.forEach((track) => {
                waveTrackKeys.add(waveKey(track));
            });

            queue.value = [...queue.value, ...fresh];
        } catch (error) {
            console.warn(
                '[Player] Не удалось пополнить волну:',
                error,
            );
        } finally {
            wavePrefetching = false;
        }
    }

    /**
     * Продолжить волну: очередь кончилась — просим следующую
     * порцию и играем первый новый трек.
     */
    async function continueWave(): Promise<boolean> {
        if (!auth.user || waveContinuing) return false;

        waveContinuing = true;

        try {
            const fresh = await fetchWaveBatch();

            if (fresh.length === 0) {
                return false;
            }

            fresh.forEach((track) => {
                waveTrackKeys.add(waveKey(track));
            });

            queue.value = [...queue.value, ...fresh];

            // Новые треки волны внешние — регистрируем через /play.
            await playTrack(fresh[0], PlaySourceListsEnum.YANDEX_WAVE);

            return true;
        } catch (error) {
            console.warn(
                '[Player] Не удалось продолжить волну:',
                error,
            );
            return false;
        } finally {
            waveContinuing = false;
        }
    }

    /**
     * Дизлайк трека волны: реакция уходит в Яндекс,
     * избранное не трогаем, играем следующий трек.
     */
    async function dislikeCurrentTrack(): Promise<void> {
        reportWave('dislike');
        await playNext();
    }

    // ============================================
    // ИЗБРАННОЕ
    // ============================================

    async function updateFavoriteState(
        track?: Track | null,
    ): Promise<void> {
        const requestId = ++favoriteCheckRequestId;

        const targetTrack =
            track ??
            currentSourceTrack.value ??
            queue.value.find(
                (item) =>
                    String(item.id)
                    === String(currentTrack.value?.id),
            );

        if (!targetTrack || !auth.user) {
            liked.value = false;
            return;
        }

        try {
            const response = await checkFavorite(targetTrack);

            if (
                requestId !== favoriteCheckRequestId ||
                String(currentTrack.value?.id)
                !== String(targetTrack.id)
            ) {
                return;
            }

            liked.value = response.is_favorite;
        } catch (error) {
            if (requestId === favoriteCheckRequestId) {
                console.error(
                    '[Player] Не удалось проверить избранное:',
                    error,
                );
            }
        }
    }

    async function toggleFavorite(
        track?: Track,
        isFavorite?: boolean,
    ): Promise<void> {
        const targetTrack =
            track ??
            currentSourceTrack.value ??
            queue.value.find(
                (item) =>
                    String(item.id)
                    === String(currentTrack.value?.id),
            );

        if (!targetTrack) {
            return;
        }

        if (
            favoriteLoading.value ||
            !auth.user
        ) {
            return;
        }

        const currentFavoriteState = track
            ? isFavorite
            : liked.value;


        if (currentFavoriteState === undefined) return;

        const requestId = ++favoriteToggleRequestId;

        if (!track) favoriteLoading.value = true;

        try {
            const response = currentFavoriteState
                ? await removeFavorite(targetTrack)
                : await addFavorite(targetTrack);

            if (requestId !== favoriteToggleRequestId) return;

            if (
                String(currentTrack.value?.id)
                === String(targetTrack.id)
            ) {
                liked.value = response.is_favorite;
            }

            // Лайк трека из волны: одновременно реакция
            // в ротацию Яндекса.
            if (response.is_favorite) {
                reportWave('like', targetTrack);
            }
        } catch (error) {
            console.error('[Player] Ошибка изменения избранного:', error);
        } finally {
            if (!track && requestId === favoriteToggleRequestId) {
                favoriteLoading.value = false;
            }
        }


        // const trackId = track.id;
        // const requestId = ++favoriteToggleRequestId;
        // favoriteLoading.value = true;
        //
        // try {
        //     const response = liked.value
        //         ? await removeFavorite(trackId)
        //         : await addFavorite(trackId);
        //
        //     if (
        //         requestId !== favoriteToggleRequestId ||
        //         String(currentTrack.value?.id) !== String(trackId)
        //     ) {
        //         return;
        //     }
        //
        //     liked.value = response.is_favorite;
        // } catch (error) {
        //     console.error('[Player] Ошибка изменения избранного:', error);
        // } finally {
        //     if (requestId === favoriteToggleRequestId) {
        //         favoriteLoading.value = false;
        //     }
        // }
    }

    watch(
        () => currentTrack.value?.id,
        (trackId) => {
            if (trackId == null) {
                liked.value = false;
                favoriteCheckRequestId++;
                return;
            }

            void updateFavoriteState();
        },
    );


    async function playTrackNext(track: Track): Promise<void> {
        if (!auth.user) return;

        try {
            // Ответ уже содержит очередь целиком —
            // отдельно запрашивать её не нужно.
            const items = await addTrackToQueue(
                track,
                createSyncMeta(),
            );

            // Добавленный трек стоит последним (макс. position) —
            // ставим его первым через reorder.
            const target = [...items].sort(
                (a, b) => b.position - a.position,
            )[0];

            if (!target) {
                throw new Error('Добавленный трек не найден в очереди.');
            }

            const orderedIds = [
                target.id,
                ...items
                    .filter((item) => item.id !== target.id)
                    .map((item) => item.id),
            ];

            const reordered = await reorderPlayerQueue(orderedIds);

            serverQueue.value = reordered;
            setServerQueueCount(reordered.length);

            void showPlayerToast(
                `Следующим играет: ${track.title} — ${getTrackArtistLine(track)}`,
            );
        } catch (error) {
            console.error(
                '[Player] Не удалось поставить трек следующим:',
                error,
            );
        }
    }

    // ============================================
    // РЕЖИМЫ ВОСПРОИЗВЕДЕНИЯ
    // ============================================

    async function toggleShuffle(): Promise<void> {
        if (!auth.user) return;

        isShuffleEnabled.value = !isShuffleEnabled.value;

        if (isShuffleEnabled.value) {
            rebuildShuffleOrder();
        } else {
            shuffleOrder = [];
            shuffleCursor = -1;
        }

        reportOptions();
    }

    async function toggleRepeatMode(): Promise<void> {
        if (!auth.user) return;

        repeatMode.value =
            repeatMode.value === 'off'
                ? 'all'
                : repeatMode.value === 'all'
                    ? 'one'
                    : 'off';

        reportOptions();
    }

    // ============================================
    // СЛЕДУЮЩИЙ / ПРЕДЫДУЩИЙ ТРЕК
    // ============================================

    /**
     * Следующий трек: локально, в приоритете — серверная очередь.
     *
     * Серверные /next не используем: бэкенд не знает содержимого
     * списков страниц. Пульт выбирает трек теми же правилами, что и
     * активное устройство, и запускает его через /play — звук
     * остаётся на устройстве, которое уже играет.
     */
    async function playNext(
        reason: 'manual' | 'ended' = 'manual',
    ): Promise<void> {

        if (!auth.user) return;

        const isActive = isLocalDeviceActive.value;

        // Повтор одного трека: просто начинаем сначала.
        // Срабатывает только на активном устройстве —
        // событие ended приходит от локального <audio>.
        if (
            isActive &&
            reason === 'ended' &&
            repeatMode.value === 'one' &&
            currentTrack.value
        ) {
            finalizeCurrentQueueItem('played');

            audio.currentTime = 0;

            try {
                await audio.play();
                reportSeek(0);
            } catch (error) {
                console.error('[Player] Не удалось повторить трек:', error);
            }

            return;
        }

        // 1) Серверная очередь в приоритете — всегда,
        // и в волне тоже: волна играет своё, только когда
        // очередь пуста.
        if (isActive) {
            finalizeCurrentQueueItem(
                reason === 'ended' ? 'played' : 'skipped',
            );

            const queueItem = takeNextFromQueue();

            if (queueItem) {
                await playQueueItem(queueItem);

                return;
            }
        } else {
            const pending = getPendingQueueItem();

            if (pending) {
                await playTrack(
                    pending.track,
                    PlaySourceListsEnum.QUEUE,
                );

                return;
            }
        }

        // 2) Список-источник.
        const nextIndex = resolveNextIndex();

        if (nextIndex !== -1) {
            if (reason !== 'ended') {
                reportWave('skip', undefined, progress.value);
            }

            if (isActive) {
                await playFromSourceList(queue.value[nextIndex]);
            } else if (playSource.value) {
                await playTrack(
                    queue.value[nextIndex],
                    playSource.value,
                );
            }

            return;
        }

        // 3) Конец списка: волна просит следующую порцию.
        if (waveMode.value) {
            const continued = await continueWave();

            if (continued) return;
        }

        if (!isActive) {
            // Пульт без списка/очереди: выбрать следующий нечем.
            return;
        }

        // Конец списка: останавливаемся на месте.
        audio.pause();
        isPlaying.value = false;
        reportPause();
    }

    async function playPrevious(): Promise<void> {
        if (!auth.user) return;

        const isActive = isLocalDeviceActive.value;

        // Более 3 секунд — перематываем в начало текущего трека.
        if (progress.value > 3) {
            await seekAudio(0);

            return;
        }

        if (isActive) {
            finalizeCurrentQueueItem('skipped');

            const previousIndex = resolvePreviousIndex();

            if (previousIndex === -1) {
                await seekAudio(0);

                return;
            }

            reportWave('skip', undefined, progress.value);

            await playFromSourceList(queue.value[previousIndex]);

            return;
        }

        // Пульт: предыдущий трек выбираем из своего списка-источника
        // и запускаем через /play. Списка нет — серверный previous
        // не используем: разумный эквивалент — начало текущего трека.
        if (currentTrackIndex.value < 0 || !playSource.value) {
            await seekAudio(0);

            return;
        }

        const previousIndex = resolvePreviousIndex();

        if (previousIndex === -1) {
            await seekAudio(0);

            return;
        }

        await playTrack(
            queue.value[previousIndex],
            playSource.value,
        );
    }

    /**
     * Запустить трек из списка-источника. Внешние треки
     * (поиск/волна) ещё не в базе — /audio по их id даст 404,
     * поэтому их сначала регистрируем через /play (ветка внешних
     * треков в playTrack). Треки из базы запускаем локально сразу.
     */
    async function playFromSourceList(track: Track): Promise<void> {
        const source = playSource.value;

        if (
            source === PlaySourceListsEnum.SEARCH
            || source === PlaySourceListsEnum.YANDEX_WAVE
        ) {
            await playTrack(track, source);

            return;
        }

        const started = await startLocalTrack(track);

        if (started && source) {
            reportTrackStarted(track, 0, source);
        }
    }

    // ============================================
    // ЗАПУСК ТРЕКА
    // ============================================
    async function playTrack(
        track: Track,
        playbackSource: PlaySourceListsEnum,
    ): Promise<void> {
        if (!track?.id || !auth.user || isLoading.value) return;

        // Мы — пульт: старая схема, сервер дёрнёт активное устройство.
        if (!isLocalDeviceActive.value) {
            const requestId = ++playbackRequestId;

            isLoading.value = true;

            try {
                const response = await playRemoteTrack(
                    track,
                    playbackSource,
                    createSyncMeta(),
                );

                if (requestId !== playbackRequestId) return;

                await applyRemotePlaybackState(
                    response.state,
                    true,
                    Number(track.id),
                );
            } catch (error) {
                console.error('[Player] Ошибка запуска трека:', error);
            } finally {
                if (requestId === playbackRequestId) {
                    isLoading.value = false;
                }
            }

            return;
        }

        playSource.value = playbackSource;

        // Список страницы ждал волну: применяем его очередь,
        // чтобы следующий/предыдущий шли уже по нему.
        if (
            pendingSourceList
            && pendingSourceList.source === playbackSource
        ) {
            applySourceQueue(
                pendingSourceList.tracks,
                pendingSourceList.source,
            );
            pendingSourceList = null;
        }

        isLoading.value = true;

        try {
            finalizeCurrentQueueItem('skipped');

            // Внешний трек (поиск/волна/шара) ещё не в базе, /audio по его
            // внешнему id не сработает. Сначала /play: бэкенд
            // сохранит трек и вернёт его версию с DB id — её
            // и запускаем локально.
            if (
                playbackSource === PlaySourceListsEnum.SEARCH
                || playbackSource === PlaySourceListsEnum.YANDEX_WAVE
                || playbackSource === PlaySourceListsEnum.SINGLE
            ) {
                const response = await playRemoteTrack(
                    track,
                    playbackSource,
                    createSyncMeta(),
                );

                const serverTrack = response.state?.current_track;

                if (!serverTrack) {
                    throw new Error(
                        'Сервер не вернул сохранённый внешний трек.',
                    );
                }

                const version = Number(response.state?.version);

                if (Number.isFinite(version)) {
                    lastAppliedVersion = version;
                }

                // Подменяем трек в списке на версию из базы:
                // следующий/предыдущий по выдаче пойдут с DB id.
                const queueIndex = queue.value.findIndex(
                    (item) =>
                        String(item.id) === String(track.id),
                );

                if (queueIndex !== -1) {
                    queue.value.splice(queueIndex, 1, serverTrack);
                }

                await startLocalTrack(serverTrack);

                return;
            }

            const started = await startLocalTrack(track);

            if (started) {
                reportTrackStarted(track, 0, playbackSource);
            }
        } finally {
            isLoading.value = false;
        }
    }


    // ============================================
    // PLAY / PAUSE
    // ============================================

    async function togglePlay(source?: PlaySourceListsEnum): Promise<void> {
        if (isLoading.value || !auth.user) return;

        if (!currentTrack.value) {
            const firstTrack = queue.value[0];
            const trackSource = source ?? playSource.value;

            if (firstTrack && trackSource) {
                await playTrack(firstTrack, trackSource);
            }

            return;
        }

        // Мы — пульт: пауза/продолжение идут через сервер.
        if (!isLocalDeviceActive.value) {
            try {
                const isCurrentlyPlaying =
                    playbackState.value?.is_playing ?? isPlaying.value;

                const response = isCurrentlyPlaying
                    ? await pauseRemotePlayback(
                        Math.max(0, progress.value),
                        createSyncMeta(),
                    )
                    : await resumeRemotePlayback(createSyncMeta());

                await applyRemotePlaybackState(response.state, true);
            } catch (error) {
                console.error(
                    '[Player] Не удалось изменить состояние воспроизведения:',
                    error,
                );
            }

            return;
        }

        if (audio.paused) {
            if (!audio.src) {
                // Состояние восстановлено с сервера, но аудио ещё
                // не загружено: стартуем текущий трек напрямую,
                // с сохранённой позиции — без лишнего круга
                // через resume на сервере.
                const track =
                    currentSourceTrack.value ??
                    queue.value.find(
                        item =>
                            String(item.id)
                            === String(currentTrack.value?.id),
                    );

                if (track) {
                    const position = Math.max(0, progress.value);

                    const started = await startLocalTrack(track, {
                        position,
                    });

                    if (started) {
                        if (playSource.value) {
                            reportTrackStarted(
                                track,
                                position,
                                playSource.value,
                            );
                        } else {
                            reportResume();
                        }
                    }
                } else {
                    // Трека нет локально — продолжаем через сервер.
                    try {
                        const response = await resumeRemotePlayback(
                            createSyncMeta(),
                        );

                        await applyRemotePlaybackState(
                            response.state,
                            true,
                        );
                    } catch (error) {
                        console.error(
                            '[Player] Не удалось продолжить:',
                            error,
                        );
                    }
                }

                return;
            }

            try {
                await audio.play();
                isPlaying.value = true;
                reportResume();
            } catch (error) {
                console.error('[Player] Не удалось продолжить:', error);
            }
        } else {
            audio.pause();
            isPlaying.value = false;
            reportPause();
        }
    }

    // ============================================
    // ПЕРЕМОТКА
    // ============================================

    async function seekAudio(value: number): Promise<void> {
        if (!Number.isFinite(value) || value < 0 || !auth.user) return;

        const target =
            audioDuration.value > 0
                ? Math.min(value, audioDuration.value)
                : value;

        isSeeking.value = true;
        progress.value = target;

        // Применяем мгновенно: на активном устройстве — к аудио,
        // на пульте — только в UI (сервер пришлёт состояние).
        if (
            isLocalDeviceActive.value &&
            audio.src &&
            audio.readyState >= HTMLMediaElement.HAVE_METADATA
        ) {
            audio.currentTime = Math.min(
                target,
                audio.duration || target,
            );
        }

        reportSeek(target);

        isSeeking.value = false;
    }

    // ============================================
    // ВРЕМЯ
    // ============================================

    function formatTime(value: number): string {
        if (!Number.isFinite(value) || value < 0) return '0:00';

        const seconds = Math.floor(value);
        const minutes = Math.floor(seconds / 60);
        const remainder = seconds % 60;

        return `${minutes}:${String(remainder).padStart(2, '0')}`;
    }

    const progressPercent = computed(() => {
        if (audioDuration.value <= 0) return 0;

        return Math.max(
            0,
            Math.min(100, (progress.value / audioDuration.value) * 100),
        );
    });

    // ============================================
    // ИНФОРМАЦИЯ ОБ УСТРОЙСТВЕ
    // ============================================

    function getDeviceUuid(): string {
        const storageKey = 'skyfi_device_uuid';
        let uuid = localStorage.getItem(storageKey);

        if (!uuid) {
            uuid = generateUuid();
            localStorage.setItem(storageKey, uuid);
        }

        return uuid;
    }

    type NavigatorUaDataBrand = {
        brand: string;
        version: string;
    };

    type NavigatorUaData = {
        brands?: NavigatorUaDataBrand[];
        mobile?: boolean;
        platform?: string;
        getHighEntropyValues?: (
            hints: string[],
        ) => Promise<Record<string, string>>;
    };

    /**
     * Client Hints (Chromium): точнее userAgent — видят реальную
     * ОС даже когда UA-строка переписана (эмуляция, WebView).
     */
    function getUaData(): NavigatorUaData | null {
        return (
            (
                navigator as Navigator & {
                    userAgentData?: NavigatorUaData;
                }
            ).userAgentData ?? null
        );
    }

    function getDeviceType(): PlayerDeviceType {
        const uaData = getUaData();

        if (typeof uaData?.mobile === 'boolean') {
            return uaData.mobile ? 'phone' : 'computer';
        }

        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
            ? 'phone'
            : 'computer';
    }

    async function getOSName(): Promise<string> {
        const uaData = getUaData();

        if (uaData?.platform) {
            switch (uaData.platform) {
                case 'Windows':
                    // Chromium на Windows 11 сообщает platformVersion >= 13
                    // (мажорная версия ядра; у Windows 10 — младше).
                    try {
                        const values =
                            await uaData.getHighEntropyValues?.([
                                'platformVersion',
                            ]);
                        const major = parseInt(
                            values?.platformVersion ?? '',
                            10,
                        );

                        if (major >= 13) return 'Windows 11';
                        if (Number.isFinite(major)) return 'Windows 10';
                    } catch {
                        // высокоэнтропийные hints недоступны — остаёмся на UA
                    }

                    return 'Windows';

                case 'macOS':
                    return 'macOS';
                case 'Linux':
                    return 'Linux';
                case 'Android':
                    return 'Android';
                case 'iOS':
                    return 'iOS';
                case 'Chrome OS':
                    return 'ChromeOS';
                default:
                    return uaData.platform;
            }
        }

        const ua = navigator.userAgent;
        const platform = navigator.platform ?? '';

        if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
        if (/Android/i.test(ua)) return 'Android';
        if (/Windows/i.test(ua)) return 'Windows';
        if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
        if (/CrOS/i.test(ua)) return 'ChromeOS';
        if (/Linux/i.test(ua) || /Linux/i.test(platform)) return 'Linux';

        return 'Неизвестная ОС';
    }

    function getBrowserName(): string {
        const uaData = getUaData();

        if (uaData?.brands?.length) {
            const brands = uaData.brands.map((brand) => brand.brand);

            if (brands.some((brand) => brand.includes('Edge'))) {
                return 'Microsoft Edge';
            }

            if (brands.some((brand) => brand.includes('Opera'))) {
                return 'Opera';
            }

            if (brands.some((brand) => brand.includes('Samsung Internet'))) {
                return 'Samsung Internet';
            }

            if (brands.some((brand) => brand.includes('Yandex'))) {
                return 'Яндекс Браузер';
            }

            if (brands.some((brand) => brand.includes('Chromium'))) {
                return 'Chromium';
            }

            if (brands.some((brand) => brand.includes('Chrome'))) {
                return 'Google Chrome';
            }
        }

        const ua = navigator.userAgent;

        if (/Edg\//i.test(ua)) return 'Microsoft Edge';
        if (/OPR\/|Opera/i.test(ua)) return 'Opera';
        if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
        if (/YaBrowser/i.test(ua)) return 'Яндекс Браузер';
        if (/Firefox\/|FxiOS\//i.test(ua)) return 'Mozilla Firefox';
        if (/CriOS\//i.test(ua)) return 'Google Chrome';
        if (/Chrome\/|Chromium\//i.test(ua)) return 'Google Chrome';

        if (/Safari\//i.test(ua) && /Apple/i.test(navigator.vendor)) {
            return 'Safari';
        }

        return 'Неизвестный браузер';
    }

    async function getDeviceName(): Promise<string> {
        return `${await getOSName()} — ${getBrowserName()}`;
    }

    // ============================================
    // ЛОКАЛЬНОЕ АУДИО
    // ============================================

    function stopLocalPlayback(): void {
        stopServerProgressTimer();
        playbackRequestId++;
        remoteStateRequestId++;
        audio.pause();
    }

    audio.addEventListener('timeupdate', () => {
        if (
            isSeeking.value ||
            !isLocalDeviceActive.value ||
            !Number.isFinite(audio.currentTime)
        ) {
            return;
        }

        progress.value = audio.currentTime;
    });

    audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
            audioDuration.value = audio.duration;
        }
    });

    audio.addEventListener('play', () => {
        if (isLocalDeviceActive.value) {
            isPlaying.value = true;
            startServerProgressTimer();
        }
    });

    audio.addEventListener('pause', () => {
        stopServerProgressTimer();
    });

    audio.addEventListener('ended', () => {
        stopServerProgressTimer();

        if (isLocalDeviceActive.value && auth.user) {
            reportWave('trackFinished', undefined, progress.value);
            void playNext('ended');
        }
    });

    audio.addEventListener('error', () => {
        console.error('[Player] Ошибка HTML Audio:', audio.error);
    });

    // ============================================
    // УСТРОЙСТВА
    // Логика переключения оставлена без изменений.
    // ============================================

    async function initializePlayerDevice(): Promise<void> {
        if (!auth.user) return;

        if (deviceInitializationPromise) {
            return deviceInitializationPromise;
        }

        deviceInitializationPromise = (async () => {
            try {
                const response = await getPlayerDevices();
                devices.value = response.data;

                const uuid = getDeviceUuid();
                const deviceName = await getDeviceName();

                let currentDevice = devices.value.find(
                    (device) => device.device_uuid === uuid,
                );

                if (!currentDevice || currentDevice.name !== deviceName) {
                    // Нет записи с таким uuid, либо профиль устройства
                    // (ОС/браузер) изменился — регистрируем повторно:
                    // бэкенд обновляет запись с тем же uuid (апсерт),
                    // а для потерянного uuid подхватывает давно
                    // неактивную запись с тем же именем.
                    const registeredDevice = await registerPlayerDevice({
                        origin_device_id: uuid,
                        command_id: createCommandId(),
                        name: deviceName,
                        type: getDeviceType(),
                    });

                    currentDevice = registeredDevice;
                    devices.value = [
                        ...devices.value.filter(
                            (device) => device.id !== registeredDevice.id,
                        ),
                        registeredDevice,
                    ];
                }

                localDeviceId.value = currentDevice.id;
                startDeviceHeartbeat();

                const commandId = createCommandId();

                const activeDevice = devices.value.find(
                    (device) => device.is_active,
                );

                if (!activeDevice) {
                    await activatePlayerDevice(currentDevice.id, {
                        origin_device_id: localDeviceId.value,
                        command_id: commandId,
                    });
                }

                await restorePlayerState();
                subscribeToDeviceChanges();
            } catch (error) {
                console.error(
                    '[Player] Не удалось инициализировать устройство:',
                    error,
                );
            } finally {
                deviceInitializationPromise = null;
            }
        })();

        return deviceInitializationPromise;
    }

    async function switchDevice(deviceId: number): Promise<void> {
        if (
            deviceSwitchLoading.value ||
            deviceId === activeDeviceId.value ||
            !auth.user
        ) {
            return;
        }
        const commandId = createCommandId();
        deviceSwitchLoading.value = true;

        try {
            const response = await activatePlayerDevice(deviceId, {
                origin_device_id: localDeviceId.value,
                command_id: commandId,
            });
            await applyRemotePlaybackState(response.state, true);

            const device = devices.value.find(
                (item) => item.id === deviceId,
            );

            void showPlayerToast(
                `Воспроизведение на устройстве: ${device?.name ?? 'другое устройство'}`,
            );
        } catch (error) {
            console.error(
                '[Player] Не удалось переключить устройство:',
                error,
            );
        } finally {
            deviceSwitchLoading.value = false;
        }
    }

    // ============================================
    // ВОССТАНОВЛЕНИЕ СОСТОЯНИЯ
    // ============================================

    async function restorePlayerState(): Promise<void> {
        if (!auth.user || isRestoringState.value) return;

        const requestId = ++restoreRequestId;
        isRestoringState.value = true;

        try {
            const response = await getPlayerState();

            if (requestId !== restoreRequestId) return;

            await applyRemotePlaybackState(response.state);

            // const queueResponse = await getPlayerQueue();
            const queueResponse = response.queue;

            if (requestId !== restoreRequestId) return;

            // Серверная очередь (со статусами) хранится отдельно
            // от списка-источника — она в приоритете при переключении.
            serverQueue.value = queueResponse;
            setServerQueueCount(queueResponse.length);

            console.log(
                '[Player] Очередь восстановлена с сервера:',
                queueResponse.length,
            );
        } catch (error) {
            console.error(
                '[Player] Не удалось восстановить состояние:',
                error,
            );
        } finally {
            if (requestId === restoreRequestId) {
                isRestoringState.value = false;
            }
        }
    }

    // ============================================
    // ПРИМЕНЕНИЕ СОСТОЯНИЯ СЕРВЕРА
    // ============================================

    async function applyRemotePlaybackState(
        state: PlaybackState,
        allowAutoplay = false,
        requestedTrackId?: number,
    ): Promise<void> {
        const incomingVersion = Number(state.version);

        if (
            Number.isFinite(incomingVersion) &&
            lastAppliedVersion !== null &&
            incomingVersion < lastAppliedVersion
        ) {
            return;
        }

        // Режим волны определяем серверным состоянием: устройства
        // показывают одно и то же, а не изолируют локальную волну.
        // Раньше здесь чужие состояния отбрасывались целиком —
        // из-за этого устройство вне волны игнорировало вообще
        // все события, пока на другом устройстве играла волна.
        if (state.play_source) {
            const isWaveState =
                state.play_source === PlaySourceListsEnum.YANDEX_WAVE;

            if (isWaveState) {
                waveMode.value = true;
            } else if (waveMode.value) {
                exitWaveMode();
            }
        }

        if (Number.isFinite(incomingVersion)) {
            lastAppliedVersion = incomingVersion;
        }

        const requestId = ++remoteStateRequestId;

        playbackState.value = state;
        activeDeviceId.value = state.active_device_id;

        // Очередь едет в составе состояния — применяем её целиком,
        // чтобы все устройства видели одну и ту же очередь.
        if (state.queue) {
            serverQueue.value = state.queue;
            setServerQueueCount(state.queue.length);
        }

        // Состояние пришло с сервера — локальная привязка
        // к элементу очереди больше не актуальна.
        currentQueueItemId = null;

        devices.value = devices.value.map((device) => ({
            ...device,
            is_active: device.id === state.active_device_id,
        }));

        isShuffleEnabled.value = state.shuffle_enabled;
        repeatMode.value = state.repeat_mode;
        isPlaying.value = state.is_playing;

        if (state.play_source) {
            playSource.value = state.play_source as PlaySourceListsEnum;
        }

        updateServerProgress(state);

        const track = state.current_track;

        if (!track) {
            currentTrack.value = null;
            currentSourceTrack.value = null;
            currentTrackIndex.value = -1;
            progress.value = 0;
            audioDuration.value = 0;
            stopLocalPlayback();
            return;
        }

        const previousTrackId = currentTrack.value?.id;

        const trackChanged =
            requestedTrackId !== undefined
                ? Number(requestedTrackId) !== Number(track.id) ||
                Number(previousTrackId) !== Number(track.id)
                : String(previousTrackId) !== String(track.id);

        const forceLoadSelectedTrack =
            requestedTrackId !== undefined &&
            Number(requestedTrackId) === Number(track.id);
        currentTrack.value = mapPlaybackTrack(track);
        currentSourceTrack.value = track;

        const foundIndex = findTrackIndex(track);

        // Не сбрасываем позицию в списке, если пришедший
        // с сервера трек не совпал ни с одним элементом
        // очереди (внешний id, список уже перезагружен).
        if (foundIndex !== -1) {
            currentTrackIndex.value = foundIndex;
        }

        audioDuration.value = getTrackDuration(track);

        if (trackChanged) {
            liked.value = false;
        }

        if (!isLocalDeviceActive.value) {
            if (!audio.paused) {
                audio.pause();
            }

            isPlaying.value = state.is_playing;

            if (state.is_playing) {
                startServerProgressTimer();
            } else {
                stopServerProgressTimer();
                progress.value = Math.max(
                    0,
                    Number(state.position_seconds) || 0,
                );
            }

            return;
        }

        if (!state.is_playing) {
            stopServerProgressTimer();

            if (!audio.paused) {
                audio.pause();
            }

            isPlaying.value = false;
            return;
        }

        // При восстановлении страницы не запускаем звук автоматически.
        // События Reverb и явные команды могут разрешить запуск.
        if (!allowAutoplay) {
            if (
                audio.src &&
                audio.readyState >= HTMLMediaElement.HAVE_METADATA &&
                !isSeeking.value
            ) {
                const serverPosition = Math.max(
                    0,
                    Number(state.position_seconds) || 0,
                );

                if (Math.abs(audio.currentTime - serverPosition) > 3) {
                    audio.currentTime = Math.min(
                        serverPosition,
                        audio.duration || serverPosition,
                    );
                }

                if (audio.paused) {
                    try {
                        await audio.play();
                    } catch (error) {
                        console.error(
                            '[Player] Не удалось продолжить аудио:',
                            error,
                        );
                    }
                }
            }

            if (!audio.paused) {
                startServerProgressTimer();
            }

            return;
        }

        try {
            const sourceMissing =
                !audio.src || audio.src === window.location.href;

            if (trackChanged || sourceMissing || forceLoadSelectedTrack) {
                audio.pause();

                const url = await resolveAudioUrl(track);

                if (
                    requestId !== remoteStateRequestId ||
                    !isLocalDeviceActive.value
                ) {
                    return;
                }

                audio.src = url;
                audio.load();

                await waitForAudioMetadata();

                if (
                    requestId !== remoteStateRequestId ||
                    !isLocalDeviceActive.value
                ) {
                    return;
                }

                const position = Math.max(
                    0,
                    Number(state.position_seconds) || 0,
                );

                audio.currentTime =
                    audio.duration > 0
                        ? Math.min(position, audio.duration)
                        : position;
            } else if (
                audio.readyState >= HTMLMediaElement.HAVE_METADATA &&
                !isSeeking.value
            ) {
                const serverPosition = Math.max(
                    0,
                    Number(state.position_seconds) || 0,
                );

                if (Math.abs(audio.currentTime - serverPosition) > 3) {
                    audio.currentTime = Math.min(
                        serverPosition,
                        audio.duration || serverPosition,
                    );
                }
            }

            if (
                requestId !== remoteStateRequestId ||
                !isLocalDeviceActive.value
            ) {
                return;
            }

            await audio.play();

            if (requestId === remoteStateRequestId) {
                isPlaying.value = true;
                startServerProgressTimer();
            }
        } catch (error) {
            console.error(
                '[Player] Не удалось запустить локальное аудио:',
                error,
            );
        }
    }

    // ============================================
    // СОКЕТЫ
    // ============================================

    /**
     * Отписаться от канала текущего пользователя.
     * Нужно при выходе из аккаунта и смене пользователя:
     * канал приватный, события чужого юзера туда не придут.
     */
    function unsubscribeFromDeviceChanges(): void {
        if (subscribedChannelName) {
            echo.leave(subscribedChannelName);
            subscribedChannelName = null;
        }

        isDeviceChangesSubscribed = false;
    }

    function subscribeToDeviceChanges(): void {
        if (!auth.user || isDeviceChangesSubscribed) return;

        const channelName = `App.Models.User.${auth.user.id}`;
        subscribedChannelName = channelName;

        echo.private(channelName)
            .listen(
                '.playback.queue.updated',
                (event: {
                    track?: { title: string; artists?: string[] } | null;
                    origin_device_id?: number | string | null;
                }) => {
                    const isOwnEvent =
                        event.origin_device_id != null &&
                        localDeviceId.value != null &&
                        String(event.origin_device_id) ===
                        String(localDeviceId.value);

                    // Очередь менялась на другом устройстве —
                    // подтягиваем её, не дожидаясь открытия панели.
                    if (!isOwnEvent) {
                        void refreshServerQueue();
                    }

                    if (!event.track || isOwnEvent) return;

                    const artists = event.track.artists?.length
                        ? event.track.artists.join(', ')
                        : 'Неизвестный исполнитель';

                    void showPlayerToast(
                        `В очередь добавлено: ${event.track.title} — ${artists}`,
                    );
                },
            )
            .listen(
                '.playback.device.connected',
                (event: {
                    device?: PlayerDevice;
                    origin_device_id?: number | string | null;
                }) => {
                    const device = event.device;

                    if (!device) return;

                    devices.value = [
                        ...devices.value.filter(
                            (item) => item.id !== device.id,
                        ),
                        device,
                    ];

                    const isOwnEvent =
                        event.origin_device_id != null &&
                        String(event.origin_device_id) ===
                        String(getDeviceUuid());

                    if (!isOwnEvent) {
                        void showPlayerToast(
                            `Подключено устройство: ${device.name}`,
                        );
                    }
                },
            )
            .listen(
                '.playback.device.disconnected',
                (event: {
                    device_id: number;
                    device_name?: string;
                }) => {
                    const deviceId = Number(event.device_id);

                    devices.value = devices.value.filter(
                        (device) => device.id !== deviceId,
                    );

                    void showPlayerToast(
                        `Устройство отключено: ${event.device_name ?? 'неизвестное устройство'}`,
                    );
                },
            )
            .listen(
                '.playback.device.changed',
                async (event: {
                    device_id: number;
                    origin_device_id?: number | string | null;
                }) => {
                    const deviceId = Number(event.device_id);

                    activeDeviceId.value = deviceId;

                    devices.value = devices.value.map((device) => ({
                        ...device,
                        is_active: device.id === deviceId,
                    }));

                    const isOwnEvent =
                        event.origin_device_id != null &&
                        localDeviceId.value != null &&
                        String(event.origin_device_id) ===
                        String(localDeviceId.value);

                    if (!isOwnEvent) {
                        const device = devices.value.find(
                            (item) => item.id === deviceId,
                        );

                        void showPlayerToast(
                            `Воспроизведение на устройстве: ${device?.name ?? 'другое устройство'}`,
                        );
                    }

                    if (localDeviceId.value !== deviceId) {
                        stopLocalPlayback();
                        return;
                    }

                    try {
                        const response = await getPlayerState();

                        if (
                            response.state.active_device_id !==
                            localDeviceId.value
                        ) {
                            return;
                        }

                        await applyRemotePlaybackState(
                            response.state,
                            true,
                        );
                    } catch (error) {
                        console.error(
                            '[Player] Не удалось синхронизировать устройство:',
                            error,
                        );
                    }
                },
            )
            .listen(
                '.playback.state.updated',
                async (event: {
                    state: PlaybackState,
                    origin_device_id: number | string | null;
                    command_id: string | null;
                }) => {
                    if (!event.state) return;

                    const isOwnEvent =
                        event.origin_device_id != null &&
                        localDeviceId.value != null &&
                        String(event.origin_device_id) === String(localDeviceId.value);

                    if (isOwnEvent) {
                        console.log(
                            '[REVERB] Событие инициировано текущим устройством',
                            {
                                originDeviceId: event.origin_device_id,
                                currentDeviceId: localDeviceId.value,
                            },
                        );

                        return;
                    }

                    // Неактивное устройство получает только состояние.
                    // Активное синхронизирует аудио с состоянием сервера.
                    await applyRemotePlaybackState(
                        event.state,
                        isLocalDeviceActive.value,
                    );
                    console.log('[REVERB] Состояние применено:', {
                        eventTrackId: event.state.current_track?.id,
                        currentTrackId: currentTrack.value?.id,
                        audioSrc: audio.currentSrc || audio.src,
                    });
                },
            );

        isDeviceChangesSubscribed = true;
    }

    // При смене пользователя (выход/повторный вход) канал Echo и
    // состояние устройства нужно пересобрать: иначе подписка
    // остаётся на канале прежнего юзера и синхронизация молчит.
    watch(
        () => auth.user?.id ?? null,
        (userId, previousUserId) => {
            if (userId === previousUserId) return;

            if (!userId) {
                unsubscribeFromDeviceChanges();
                stopDeviceHeartbeat();
                stopLocalPlayback();

                devices.value = [];
                localDeviceId.value = null;
                activeDeviceId.value = null;
                playbackState.value = null;
                lastAppliedVersion = null;

                return;
            }

            void initializePlayerDevice();
        },
    );


    // ============================================
    // ЭКСПОРТ
    // ============================================

    return {
        queue,
        serverQueue,
        currentTrackIndex,
        setQueue,
        addToQueue,
        playTrackNext,
        playServerQueueItem,
        serverQueueCount,
        setServerQueueCount,

        currentTrack,
        isPlaying,
        isLoading,

        progress,
        audioDuration,
        progressPercent,
        volume,

        liked,
        favoriteLoading,
        updateFavoriteState,
        toggleFavorite,

        // Моя Волна
        waveMode,
        startWave,
        dislikeCurrentTrack,

        isSeeking,
        seekAudio,

        playTrack,
        playNext,
        playPrevious,
        togglePlay,

        isShuffleEnabled,
        toggleShuffle,
        repeatMode,
        toggleRepeatMode,

        formatTime,

        devices,
        activeDeviceId,
        localDeviceId,
        isLocalDeviceActive,
        isDeviceOnline,

        isDevicesLoading,
        deviceSwitchLoading,
        playbackState,
        isServerSyncEnabled,

        initializePlayerDevice,
        switchDevice,

        isRestoringState,

        subscribeToDeviceChanges,
    };
});

export default usePlayerStore;
