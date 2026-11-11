import {computed, ref, watch} from 'vue';
import {defineStore} from 'pinia';
import {toastController} from '@ionic/vue';
import axios from 'axios';
import {Capacitor} from '@capacitor/core';
import {Device} from '@capacitor/device';
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
    initMediaSession,
    updateMediaSessionTrack,
    updateMediaSessionPlaybackState,
    updateMediaSessionPosition,
} from '@/lib/mediaSession';

import {
    getWaveTracks,
    sendWaveFeedback,
    type WaveFeedbackType,
} from '@/api/wave';

import {
    type Track,
    type TrackSourceType,
} from '@/types/TrackType';
import {useDownloadsStore} from '@/stores/downloads';
import {useNetworkStore} from '@/stores/network';

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
    removeTrackFromQueue,
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
        source_type: TrackSourceType;
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

    /**
     * Локальный снимок previous_play_source: что играло до входа
     * в серверную очередь. На активном устройстве broadcast-события
     * собственного origin игнорируются, поэтому playbackState из
     * эфира не обновится — переход в очередь запоминаем сами,
     * а состоянием сервера только подтверждаем (restore/пульт).
     *
     * resumeAfter: true — трек списка доиграл до входа в очередь,
     * возвращаться нужно к СЛЕДУЮЩЕМУ треку, а не к нему самому.
     */
    const previousPlaySourceSnapshot = ref<{
        source: PlaySourceListsEnum;
        trackId: number | string | null;
        resumeAfter: boolean;
    } | null>(null);

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

    /**
     * Это приложение реально воспроизводит звук: либо сервер
     * подтвердил активность устройства, либо сервер недоступен —
     * тогда звук всё равно локальный, управляем аудио напрямую
     * (офлайн-режим). Серверные «пультовые» ветки в этом режиме
     * бессмысленны: командовать некому.
     */
    const isLocalPlayback = computed(
        () =>
            isLocalDeviceActive.value
            || !useNetworkStore().isOnline,
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

    /**
     * План воспроизведения: индексы queue, которые ещё сыграют.
     * Материализован заранее — превью следующего всегда честное.
     * Реактивен: превью-вычисления слайдеров следят за ним.
     * В волне не используется: там порядок вычисляемый,
     * shuffle и repeat не действуют.
     */
    const plan = ref<number[]>([]);

    /**
     * Сыгранные в текущем списке треки (индексы queue) — единственная
     * правда о «предыдущем». Живёт, пока жив список: смена списка
     * стирает историю. Потреблённые треки серверной очереди сюда
     * не попадают — забываем.
     */
    const backStack = ref<number[]>([]);

    /** Кеш полученных через /tracks/{id}/audio ссылок (на время сессии).
     *  fetchedAt — когда ссылка получена, для проверки по TTL источника. */
    const audioUrlCache = new Map<
        number,
        { url: string; fetchedAt: number }
    >();

    /** Треки, чьи ссылки сейчас запрашиваются предзагрузкой:
     *  resolveAudioUrl дожидается чужой загрузки, не дублируя
     *  запрос. */
    const preloadInFlight = new Map<number, Promise<string>>();

    /** Отдельный аудиоэлемент, прогревающий файл следующего
     *  трека (см. prewarmNextTrackFile). */
    let audioPrewarmer: HTMLAudioElement | null = null;

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
            // Запись устройства могла быть удалена серверной
            // уборкой: устройства — присутствие, молчащие
            // забываются. Перерегистрируемся, иначе все
            // команды плеера посыплются по 404/422
            // (origin_device_id перестанет существовать).
            if (
                axios.isAxiosError(error) &&
                error.response?.status === 404
            ) {
                console.warn(
                    '[Player] Устройство забыто сервером, перерегистрация...',
                );

                void initializePlayerDevice();
            } else {
                console.warn(
                    '[Player] Heartbeat не отправлен:',
                    error,
                );
            }

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

            if (isLocalPlayback.value) {
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

        const previousQueue = queue.value;

        // Тот же список подрос (дозагрузка страницы): источник
        // прежний, текущий трек в списке есть и прежние позиции
        // совпадают с новыми с начала — индексы истории и плана
        // остаются валидными, новые треки вольются в конец плана.
        // Перестановка, сжатие или мусорная старая очередь
        // (восстановленная сессия строила план по пустой) —
        // полный ребилд: индексы считать заново.
        const sameList =
            source !== null
            && source === playSource.value
            && currentTrack.value !== null
            && tracks.some(
                track =>
                    String(track.id) === String(currentTrack.value?.id),
            );

        const isExtension =
            sameList
            && previousQueue.length > 0
            && tracks.length >= previousQueue.length
            && previousQueue.every(
                (track, index) =>
                    String(tracks[index]?.id) === String(track.id),
            );

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

        if (isExtension) {
            const knownIds = new Set(
                previousQueue.map(track => track.id),
            );
            const fresh: number[] = [];

            queue.value.forEach((track, index) => {
                if (!knownIds.has(track.id)) fresh.push(index);
            });

            if (fresh.length > 0) {
                plan.value = [...plan.value, ...fresh];
            }

            // Подгруженная страница: ссылки новых треков — в кеш.
            preloadUpcomingUrls();

            return;
        }

        // Новый или изменившийся список: история стёрта,
        // план строится заново.
        backStack.value = [];
        plan.value = buildPlan();

        preloadUpcomingUrls();
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

    /**
     * Мета команд плеера. Якорь волны передаём только
     * для её треков: бэкенд хранит его в состоянии,
     * а /play из других источников (null) цепочку
     * сбрасывает.
     */
    function createSyncMeta(source?: PlaySourceListsEnum): {
        origin_device_id: number | null;
        command_id: string;
        wave_anchor?: string | null;
    } {
        const meta: {
            origin_device_id: number | null;
            command_id: string;
            wave_anchor?: string | null;
        } = {
            origin_device_id: localDeviceId.value,
            command_id: createCommandId(),
        };

        if (source === PlaySourceListsEnum.YANDEX_WAVE) {
            meta.wave_anchor = waveAnchor;
        }

        return meta;
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
     *
     * isPreload — вызов от предзагрузки: собственную заявку в
     * preloadInFlight не проверяем, иначе продолжение этого же
     * вызова найдёт само себя (цикл промисов).
     */
    async function resolveAudioUrl(
        track: Track,
        forceFresh = false,
        isPreload = false,
    ): Promise<string> {
        // Скачанный трек играем локально: без сети и TTL.
        if (!forceFresh) {
            const localUrl =
                await useDownloadsStore().getLocalAudioUrl(track);

            if (localUrl) {
                return localUrl;
            }
        }

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

        // Предзагрузка уже запрашивает эту ссылку — дожидаемся
        // её, а не дублируем запрос. Сама предзагрузка свою
        // заявку не проверяет: иначе продолжение этого же
        // вызова найдёт собственный промис (цикл).
        if (!forceFresh && !isPreload) {
            const inFlight = preloadInFlight.get(trackId);

            if (inFlight) {
                return inFlight;
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
     * Предзагрузка ссылок на ближайшие треки плана.
     *
     * План знает, что сыграет следующим, — запрашиваем ссылки
     * заранее и кладём в audioUrlCache: переключение не ждёт
     * раундтрип /audio. В очередях с внешними треками (поиск,
     * волна) ссылок ещё нет: /audio по внешнему id не работает,
     * треки регистрируются через /play при воспроизведении.
     * Списки библиотеки (избранное, загрузки, плейлисты) — все
     * треки в базе, предзагружаем целиком. Протухшая к запуску
     * ссылка не страшна: resolveAudioUrl перепроверяет свежесть.
     */
    function preloadUpcomingUrls(count = 5): void {
        if (!useNetworkStore().isOnline) return;

        if (
            playSource.value === PlaySourceListsEnum.YANDEX_WAVE
            || playSource.value === PlaySourceListsEnum.SEARCH
        ) {
            return;
        }

        for (const index of plan.value.slice(0, count)) {
            const track = queue.value[index];

            if (!track) continue;

            const trackId = Number(track.id);

            if (
                !Number.isFinite(trackId)
                || audioUrlCache.has(trackId)
                || preloadInFlight.has(trackId)
            ) {
                continue;
            }

            const request = resolveAudioUrl(track, false, true);

            preloadInFlight.set(trackId, request);

            void request
                .then(() => {
                    // Ссылка следующего трека готова — греем его файл.
                    prewarmNextTrackFile();
                })
                .catch(() => {
                    // Не тащим битое в кеш: resolveAudioUrl
                    // кладёт туда только успешный ответ.
                })
                .finally(() => {
                    preloadInFlight.delete(trackId);
                });
        }
    }

    /**
     * Прогрев файла ближайшего следующего трека: браузер начинает
     * качать аудио заранее, и переключение не ждёт загрузки
     * метаданных. Один прогреваемый трек — следующий по плану.
     */
    function prewarmNextTrackFile(): void {
        const index = waveMode.value
            ? currentTrackIndex.value + 1
            : plan.value[0];

        const track =
            index === undefined ? null : queue.value[index] ?? null;

        const cached = track
            ? audioUrlCache.get(Number(track.id))
            : undefined;

        if (!cached) {
            audioPrewarmer = null;
            return;
        }

        if (audioPrewarmer && audioPrewarmer.src === cached.url) {
            return;
        }

        const preloader = new Audio();

        preloader.preload = 'auto';
        preloader.src = cached.url;
        audioPrewarmer = preloader;
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

                // Следующие треки плана: ссылки готовим заранее,
                // файл ближайшего — прогреваем.
                preloadUpcomingUrls();
                prewarmNextTrackFile();

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
                createSyncMeta(source),
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
     * Уход с играющего элемента серверной очереди. Сыгранное
     * и пропущенное в очереди не храним: элемент удаляется
     * сразу — локально и на сервере.
     */
    function finalizeCurrentQueueItem(): void {
        if (currentQueueItemId === null) return;

        const queueItemId = currentQueueItemId;

        currentQueueItemId = null;

        serverQueue.value = serverQueue.value.filter(
            queueItem => queueItem.id !== queueItemId,
        );
        setServerQueueCount(serverQueue.value.length);

        backgroundSync(
            () => removeTrackFromQueue(queueItemId),
            'queue-remove-current',
        );
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
        // Прежний играющий элемент удаляем: новый займёт его место.
        finalizeCurrentQueueItem();

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

        // Клик по очереди прерывает играющий список — запоминаем,
        // куда возвращаться, когда очередь закончится.
        if (currentQueueItemId === null) {
            rememberPreviousPlaySource(false);
        }

        exitWaveMode();
        playSource.value = PlaySourceListsEnum.QUEUE;

        await playQueueItem(item);
    }

    /**
     * Очередь отыграна полностью — сыгранное и пропущенное
     * не храним: чистим локальную копию и серверную очередь.
     */
    function clearFinishedServerQueue(): void {
        const finished = serverQueue.value.filter(
            item => item.status !== 'pending',
        );

        if (finished.length === 0) return;

        serverQueue.value = serverQueue.value.filter(
            item => item.status === 'pending',
        );

        setServerQueueCount(serverQueue.value.length);

        for (const item of finished) {
            backgroundSync(
                () => removeTrackFromQueue(item.id),
                'queue-clear-finished',
            );
        }
    }

    /**
     * Запомнить, что играло до входа в серверную очередь.
     * resumeAfter — трек списка доиграл (а не был прерван),
     * поэтому возвращаться нужно к следующему треку списка.
     */
    function rememberPreviousPlaySource(resumeAfter: boolean): void {
        if (
            !playSource.value
            || playSource.value === PlaySourceListsEnum.QUEUE
            || !currentSourceTrack.value
        ) {
            return;
        }

        previousPlaySourceSnapshot.value = {
            source: playSource.value,
            trackId: currentSourceTrack.value.id,
            resumeAfter,
        };
    }

    /**
     * Очередь закончилась — возвращаемся к списку, который играл
     * до неё. Источник и трек берём из локального снимка (см.
     * previousPlaySourceSnapshot), при его отсутствии — из полей
     * previous_play_source / previous_play_source_track_id /
     * last_source_track_id серверного состояния. Трек ищем
     * в текущем списке: по DB id, для внешних — по source_id.
     */
    async function returnToPreviousPlaySource(
        reason: 'manual' | 'ended',
    ): Promise<boolean> {
        const state = playbackState.value;
        const snapshot = previousPlaySourceSnapshot.value;

        const previousSource =
            snapshot?.source
            ?? (state?.previous_play_source as
                | PlaySourceListsEnum
                | undefined);

        const previousTrackId =
            snapshot?.trackId
            ?? state?.previous_play_source_track_id
            ?? state?.last_source_track_id;

        if (
            !previousSource
            || previousTrackId === null
            || previousTrackId === undefined
            || previousSource === PlaySourceListsEnum.QUEUE
        ) {
            return false;
        }

        const findSourceTrackIndex = (
            trackId: number | string,
        ): number =>
            queue.value.findIndex(
                track =>
                    String(track.id) === String(trackId)
                    || (
                        track.source_id !== null
                        && String(track.source_id) === String(trackId)
                    ),
            );

        let targetIndex = findSourceTrackIndex(previousTrackId);

        if (targetIndex === -1) return false;

        if (snapshot?.resumeAfter) {
            // Трек доиграл до входа в очередь — продолжаем
            // со следующего. Если он был последним — возврата нет.
            const nextIndex = targetIndex + 1;

            if (nextIndex >= queue.value.length) {
                previousPlaySourceSnapshot.value = null;

                return false;
            }

            targetIndex = nextIndex;
        }

        const previousTrack = queue.value[targetIndex];

        if (reason !== 'ended') {
            reportWave('skip', undefined, progress.value);
        }

        await playTrack(previousTrack, previousSource);

        previousPlaySourceSnapshot.value = null;

        return true;
    }

    // ============================================
    // ПОРЯДОК ВОСПРОИЗВЕДЕНИЯ: ПЛАН + ИСТОРИЯ
    // ============================================

    /** Перемешивание Фишера—Йётса (возвращает копию). */
    function shuffled(indices: number[]): number[] {
        const result = [...indices];

        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));

            [result[i], result[j]] = [result[j], result[i]];
        }

        return result;
    }

    /**
     * Построить план от текущего трека.
     * Без shuffle — естественный порядок после текущего;
     * с shuffle — перемешанные непрослушанные (круг списка
     * без повторов); всё прослушано — перемешиваем всех.
     * Волна shuffle игнорирует: она и есть рандом.
     */
    function buildPlan(): number[] {
        const total = queue.value.length;
        const current = currentTrackIndex.value;

        const others: number[] = [];

        for (let index = 0; index < total; index++) {
            if (index !== current) others.push(index);
        }

        if (!isShuffleEnabled.value || waveMode.value) {
            const after = others.filter(index => index > current);

            // Повтор всего: последний трек — план с начала списка.
            if (after.length === 0 && repeatMode.value === 'all') {
                return others;
            }

            return after;
        }

        const played = new Set(backStack.value);
        const unplayed = others.filter(index => !played.has(index));

        return shuffled(unplayed.length > 0 ? unplayed : others);
    }

    /**
     * План исчерпан при включённом повторе всего — новый круг.
     * Волна сюда не попадает: конец её порции — это continueWave,
     * а не повтор.
     */
    function ensurePlan(): void {
        if (plan.value.length > 0) return;
        if (waveMode.value) return;
        if (queue.value.length < 2) return;
        if (repeatMode.value !== 'all') return;

        plan.value = buildPlan();
    }

    /** Прерванный трек списка уходит в историю (без дублей подряд). */
    function pushCurrentToBackStack(): void {
        const current = currentTrackIndex.value;

        if (current < 0) return;
        if (backStack.value[backStack.value.length - 1] === current) return;

        backStack.value.push(current);
    }

    /**
     * Ручной запуск трека списка состоялся: прежний текущий
     * уходит в историю, план строится заново от нового трека.
     */
    function commitManualStart(previousIndex: number): void {
        if (
            previousIndex >= 0
            && previousIndex !== currentTrackIndex.value
            && backStack.value[backStack.value.length - 1] !== previousIndex
        ) {
            backStack.value.push(previousIndex);
        }

        plan.value = buildPlan();

        // План сменился вручную — перевооружаем предзагрузку
        // и прогрев: окно от нового трека, а не от старого.
        preloadUpcomingUrls();
        prewarmNextTrackFile();
    }

    /**
     * Следующий индекс списка-источника.
     * -1 — воспроизведение дальше невозможно.
     * Волна — строго по очереди (shuffle/repeat не действуют).
     */
    function resolveNextIndex(): number {
        if (queue.value.length === 0) return -1;

        if (waveMode.value) {
            const next = currentTrackIndex.value + 1;

            return next < queue.value.length ? next : -1;
        }

        ensurePlan();

        return plan.value.length > 0 ? plan.value.shift()! : -1;
    }

    /**
     * Предыдущий индекс: вершина истории списка.
     * -1 — истории нет, достаточно перемотать в начало.
     */
    function resolvePreviousIndex(): number {
        if (queue.value.length === 0) return -1;

        return backStack.value.length > 0
            ? backStack.value[backStack.value.length - 1]
            : -1;
    }

    /**
     * Подгляд следующего трека без побочных эффектов. Для слайдера.
     */
    function peekNextListIndex(): number {
        if (queue.value.length === 0) return -1;

        if (waveMode.value) {
            const next = currentTrackIndex.value + 1;

            return next < queue.value.length ? next : -1;
        }

        ensurePlan();

        return plan.value.length > 0 ? plan.value[0] : -1;
    }

    /** Подгляд предыдущего трека без побочных эффектов. */
    function peekPreviousListIndex(): number {
        if (queue.value.length === 0) return -1;

        return backStack.value.length > 0
            ? backStack.value[backStack.value.length - 1]
            : -1;
    }

    /**
     * Соседние треки для слайдера: что подъедет при свайпе.
     * Приблизительно для пульта (его список может отличаться) —
     * плеер показывает эти превью только на активном устройстве.
     */
    const previewNextTrack = computed<Track | null>(() => {
        if (!auth.user) return null;

        const pending = getPendingQueueItem();

        if (pending) return pending.track;

        const index = peekNextListIndex();

        return index === -1 ? null : queue.value[index] ?? null;
    });

    const previewPreviousTrack = computed<Track | null>(() => {
        if (!auth.user) return null;

        const index = peekPreviousListIndex();

        return index === -1 ? null : queue.value[index] ?? null;
    });

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
            tracks ??= await getWaveTracks(5);

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

            // Новый список: история стёрта. План в волне не нужен —
            // порядок вычисляемый, shuffle и repeat не действуют.
            backStack.value = [];
            plan.value = [];

            queue.value = [...tracks];
            currentTrackIndex.value = index;

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
        const tracks = await getWaveTracks(5, waveAnchor);

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
    /**
     * Подгрузить следующую порцию волны и дописать в очередь.
     * Играть не начинаем: playNext сам возьмёт первый трек
     * новой порции через resolveNextIndex.
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

        // Волна — сама рандом: перемешивание на ней не действует.
        if (waveMode.value) return;

        isShuffleEnabled.value = !isShuffleEnabled.value;

        // План перестраивается сразу: превью следующего честное.
        // История не трогается — «назад» ходит по реально игранному.
        plan.value = buildPlan();
        preloadUpcomingUrls();

        reportOptions();
    }

    async function toggleRepeatMode(): Promise<void> {
        if (!auth.user) return;

        // Волна не повторяется: конец порции — следующая порция.
        if (waveMode.value) return;

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
     * Офлайн-перебор списка: от уже извлечённого кандидата ищем
     * трек с локальным файлом. Нескачанные выбывают из плана.
     * Всё пройдено — останавливаемся.
     */
    async function playNextDownloaded(
        nextIndex: number,
    ): Promise<void> {
        const downloads = useDownloadsStore();
        const visited = new Set<number>();
        let index = nextIndex;

        while (index >= 0 && !visited.has(index)) {
            visited.add(index);

            const candidate = queue.value[index];

            if (
                candidate
                && await downloads.hasLocalAudio(candidate)
            ) {
                await playFromSourceList(candidate);

                return;
            }

            index = resolveNextIndex();
        }

        audio.pause();
        isPlaying.value = false;
        reportPause();
    }

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

        const isActive = isLocalPlayback.value;

        // Повтор одного трека: просто начинаем сначала.
        // Срабатывает только на активном устройстве —
        // событие ended приходит от локального <audio>.
        // Волна не повторяется: repeat на ней не действует.
        if (
            isActive &&
            !waveMode.value &&
            reason === 'ended' &&
            repeatMode.value === 'one' &&
            currentTrack.value
        ) {
            finalizeCurrentQueueItem();

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
            // Чем закончился шаг — элементом очереди или треком
            // списка: от этого зависит возврат к прежнему списку.
            const wasQueueItem = currentQueueItemId !== null;

            // Плеер переходит от списка к очереди: запоминаем,
            // откуда пришли (серверное состояние на активном
            // устройстве собственными событиями не обновляется).
            if (!wasQueueItem) {
                rememberPreviousPlaySource(reason === 'ended');
            }

            finalizeCurrentQueueItem();

            const queueItem = takeNextFromQueue();

            if (queueItem) {
                // История: прерванный трек списка запоминаем,
                // потреблённый элемент очереди — забываем.
                pushCurrentToBackStack();

                await playQueueItem(queueItem);

                return;
            }

            // Очередь отыграна полностью: сыгранное не храним,
            // возвращаемся к списку, который играл до очереди.
            clearFinishedServerQueue();

            if (wasQueueItem) {
                const returned = await returnToPreviousPlaySource(reason);

                if (returned) return;
            }
        } else {
            const pending = getPendingQueueItem();

            if (pending) {
                await playTrack(
                    pending.track,
                    PlaySourceListsEnum.QUEUE,
                );

                // Пульт запустил элемент очереди — удаляем его
                // сразу, как это делает активное устройство.
                serverQueue.value = serverQueue.value.filter(
                    queueItem => queueItem.id !== pending.id,
                );
                setServerQueueCount(serverQueue.value.length);

                backgroundSync(
                    () => removeTrackFromQueue(pending.id),
                    'queue-remove-remote',
                );

                return;
            }
        }

        // 2) Список-источник.
        let nextIndex = resolveNextIndex();

        // 3) Конец порции волны: просим следующую и берём
        // первый трек новой порции через resolveNextIndex.
        if (nextIndex === -1 && waveMode.value) {
            const continued = await continueWave();

            if (continued) {
                nextIndex = resolveNextIndex();
            }
        }

        if (nextIndex !== -1) {
            if (reason !== 'ended') {
                reportWave('skip', undefined, progress.value);
            }

            // История: прерываемый трек списка запоминаем.
            pushCurrentToBackStack();

            if (isActive) {
                if (useNetworkStore().isOnline) {
                    await playFromSourceList(queue.value[nextIndex]);
                } else {
                    // Офлайн: не скачанные треки пропускаем,
                    // ищем следующий доступный локально.
                    await playNextDownloaded(nextIndex);
                }
            } else if (playSource.value) {
                await playTrack(
                    queue.value[nextIndex],
                    playSource.value,
                );
            }

            return;
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

        const isActive = isLocalPlayback.value;

        // Более 3 секунд — перематываем в начало текущего трека.
        if (progress.value > 3) {
            await seekAudio(0);

            return;
        }

        if (isActive) {
            finalizeCurrentQueueItem();

            let previousIndex = resolvePreviousIndex();

            // Офлайн: из истории берём ближайший скачанный,
            // нескачанные позади пропускаем — забываем.
            if (!useNetworkStore().isOnline) {
                previousIndex = await findPreviousDownloadedIndex();
            }

            if (previousIndex === -1) {
                await seekAudio(0);

                return;
            }

            // Текущий — обратно в голову плана: следующий
            // вернёт его, история двигается честно.
            if (!waveMode.value && currentTrackIndex.value >= 0) {
                plan.value.unshift(currentTrackIndex.value);
            }

            backStack.value.pop();

            // Голову плана сменили — перевооружаем предзагрузку
            // и прогрев: следующий трек теперь другой.
            preloadUpcomingUrls();
            prewarmNextTrackFile();

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

        if (!waveMode.value && currentTrackIndex.value >= 0) {
            plan.value.unshift(currentTrackIndex.value);
        }

        backStack.value.pop();

        await playTrack(
            queue.value[previousIndex],
            playSource.value,
        );
    }

    /**
     * Офлайн-поиск назад: ближайший скачанный трек в истории.
     * Нескачанные позади пропускаем — выбывают из истории.
     * -1 — скачанных позади нет, остаётся начало текущего трека.
     */
    async function findPreviousDownloadedIndex(): Promise<number> {
        const downloads = useDownloadsStore();

        while (backStack.value.length > 0) {
            const index = backStack.value[backStack.value.length - 1];
            const candidate = queue.value[index];

            if (
                candidate
                && await downloads.hasLocalAudio(candidate)
            ) {
                return index;
            }

            backStack.value.pop();
        }

        return -1;
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

        // Офлайн (в т.ч. сервер не отвечает): дистанционное
        // управление невозможно — играем локально, если трек
        // скачан. Активность устройства сервер не подтвердит,
        // поэтому ей здесь не определяемся: иначе после
        // перезагрузки страницы без сети скачанные треки
        // уходили в серверную ветку и падали с Network Error.
        if (!useNetworkStore().isOnline) {
            const downloads = useDownloadsStore();

            if (await downloads.hasLocalAudio(track)) {
                playSource.value = playbackSource;

                const previousIndex = currentTrackIndex.value;

                const started = await startLocalTrack(track);

                if (started) {
                    isPlaying.value = true;
                    commitManualStart(previousIndex);
                }

                return;
            }
        }

        // Мы — пульт: старая схема, сервер дёрнёт активное устройство.
        // Только онлайн: офлайн сервер недоступен, «пультовать»
        // некому — звук остаётся локальным (см. isLocalPlayback).
        if (
            !isLocalDeviceActive.value
            && useNetworkStore().isOnline
        ) {
            const requestId = ++playbackRequestId;

            isLoading.value = true;

            try {
                const response = await playRemoteTrack(
                    track,
                    playbackSource,
                    createSyncMeta(playbackSource),
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

        // История: что играло до ручного запуска — запоминаем
        // до смены текущего трека.
        const previousIndex = currentTrackIndex.value;

        isLoading.value = true;

        try {
            finalizeCurrentQueueItem();

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
                    createSyncMeta(playbackSource),
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

                commitManualStart(previousIndex);

                return;
            }

            const started = await startLocalTrack(track);

            if (started) {
                reportTrackStarted(track, 0, playbackSource);
                commitManualStart(previousIndex);
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
        // Офлайн пульт не работает — остаёмся в локальной ветке.
        if (
            !isLocalDeviceActive.value
            && useNetworkStore().isOnline
        ) {
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

        // Применяем мгновенно: на активном устройстве (или офлайн,
        // где звук всегда локальный) — к аудио, на пульте — только
        // в UI (сервер пришлёт состояние).
        if (
            isLocalPlayback.value &&
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

            // У Google Chrome бренды тоже содержат "Chromium" —
            // полное имя проверяем первым, иначе весь хром зовётся "Chromium".
            if (brands.some((brand) => brand.includes('Google Chrome'))) {
                return 'Google Chrome';
            }

            if (brands.some((brand) => brand.includes('Chromium'))) {
                return 'Chromium';
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
        const osName = await getOSName();

        // 1) Нативно (APK): реальные производитель и модель устройства.
        if (Capacitor.isNativePlatform()) {
            try {
                const info = await Device.getInfo();

                if (info.model) {
                    const manufacturer = info.manufacturer
                        ? `${info.manufacturer} `
                        : '';
                    const osVersion = info.osVersion
                        ? ` ${info.osVersion}`
                        : '';

                    return `${manufacturer}${info.model} (${osName}${osVersion})`;
                }
            } catch {
                // плагин недоступен — пробуем Client Hints
            }
        }

        // 2) Client Hints: Chromium на Android отдаёт модель устройства.
        try {
            const values =
                await getUaData()?.getHighEntropyValues?.(['model']);

            if (values?.model) {
                return `${values.model} (${osName})`;
            }
        } catch {
            // высокоэнтропийные hints недоступны
        }

        // 3) Только ОС и браузер (+ разрешение, чтобы различать компьютеры).
        const screenSize =
            typeof screen !== 'undefined'
                ? ` · ${screen.width}×${screen.height}`
                : '';

        return `${osName} — ${getBrowserName()}${screenSize}`;
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
            !isLocalPlayback.value ||
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
        if (isLocalPlayback.value) {
            isPlaying.value = true;
            startServerProgressTimer();
        }
    });

    audio.addEventListener('pause', () => {
        stopServerProgressTimer();
    });

    audio.addEventListener('ended', () => {
        stopServerProgressTimer();

        if (isLocalPlayback.value && auth.user) {
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

        // Якорь волны общий для устройств: серверное состояние
        // знает цепочку лучше локального снимка — другой клиент
        // мог уже продвинуть её. Без этого пульт продолжает
        // волну с пустым якорем, и Яндекс каждый раз отдаёт
        // стартовую порцию (круг из нескольких песен).
        if (state.wave_anchor !== undefined) {
            waveAnchor = state.wave_anchor;
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

        // Состояние пришло с сервера. Локальную привязку
        // к элементу очереди сохраняем, только если сервер
        // подтверждает, что играет именно этот элемент;
        // иначе (трек списка, чужая команда) сбрасываем —
        // иначе «сыгранный» элемент остаётся призраком
        // в очереди и потом играет повторно.
        if (currentQueueItemId !== null) {
            const currentItem = state.queue?.find(
                (item) => item.id === currentQueueItemId,
            );

            const serverTrackId = state.current_track?.id ?? null;

            const stillCurrent =
                currentItem !== undefined &&
                serverTrackId !== null &&
                String(currentItem.track?.id) === String(serverTrackId);

            if (!stillCurrent) {
                currentQueueItemId = null;
            }
        }

        devices.value = devices.value.map((device) => ({
            ...device,
            is_active: device.id === state.active_device_id,
        }));

        isShuffleEnabled.value = state.shuffle_enabled;
        repeatMode.value = state.repeat_mode;
        isPlaying.value = state.is_playing;

        if (state.play_source) {
            playSource.value = state.play_source as PlaySourceListsEnum;

            // Пока играет очередь, previous_play_source состояния —
            // источник, к которому вернёмся после неё: синхронизируем
            // локальный снимок (актуально после restore и для команд
            // с другого устройства).
            if (
                state.play_source === PlaySourceListsEnum.QUEUE
                && state.previous_play_source
                && state.previous_play_source !== PlaySourceListsEnum.QUEUE
            ) {
                previousPlaySourceSnapshot.value = {
                    source: state.previous_play_source as PlaySourceListsEnum,
                    trackId:
                        state.previous_play_source_track_id ?? null,
                    resumeAfter: false,
                };
            }
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

        // План применяем к пришедшей очереди: без позиций вне
        // списка и без самого текущего. Пустой — строим заново
        // (свежая сессия); непустой после чистки не трогаем:
        // активное устройство знает порядок лучше серверного
        // снимка.
        plan.value = plan.value.filter(
            index =>
                index !== currentTrackIndex.value
                && index >= 0
                && index < queue.value.length,
        );

        if (plan.value.length === 0 && !waveMode.value) {
            plan.value = buildPlan();
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
            } else {
                // Звук реально не пошёл (пустой src / автоплей
                // запрещён браузером без жеста). Не заявляем
                // «playing»: иначе после перезагрузки страницы
                // плеер рисует воспроизведение без звука, а
                // медиасессия сообщает ОС «на паузе» — комбинированная
                // клавиша ⏯ шлёт 'pause', и «play» от пользователя
                // превращается в no-op.
                isPlaying.value = false;
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

    // ============================================
    // MEDIA SESSION
    //
    // Метаданные и обработчики системных медиакнопок:
    // руль, гарнитура, lockscreen. Пульт и активное
    // устройство обрабатываются одинаково — команды
    // тех же togglePlay/playNext/playPrevious,
    // сами разбираются, локально им управлять.
    // ============================================

    initMediaSession({
        onPlay: () => {
            // Реагируем на реальное состояние, а не на флаг:
            // после обрывов связи/стопов флаг isPlaying может
            // расходиться с истиной, и браузер шлёт 'pause'
            // туда, где пользователь жмёт «play», — тогда
            // обработчик no-op'ился, и клавиша «не работала».
            const paused = isLocalPlayback.value
                ? audio.paused
                : !isPlaying.value;

            if (paused) void togglePlay();
        },
        onPause: () => {
            const playing = isLocalPlayback.value
                ? !audio.paused
                : isPlaying.value;

            if (playing) void togglePlay();
        },
        onStop: () => {
            const playing = isLocalPlayback.value
                ? !audio.paused
                : isPlaying.value;

            if (playing) void togglePlay();

            void seekAudio(0);
        },
        onNext: () => {
            void playNext();
        },
        onPrevious: () => {
            void playPrevious();
        },
        onSeekBackward: (offset) => {
            void seekAudio(progress.value - offset);
        },
        onSeekForward: (offset) => {
            void seekAudio(progress.value + offset);
        },
        onSeekTo: (seconds) => {
            void seekAudio(seconds);
        },
    });

    function syncMediaSession(): void {
        const track = currentTrack.value;

        updateMediaSessionTrack(
            track
                ? {
                      title: track.title,
                      artist: track.artist,
                      album: track.albumTitle,
                      artworkUrl: track.coverPath,
                  }
                : null,
        );

        updateMediaSessionPlaybackState(
            track !== null,
            isPlaying.value,
        );

        if (track) {
            updateMediaSessionPosition(
                progress.value,
                audioDuration.value,
            );
        }
    }

    // Позиция в уведомлении — не чаще раза в 10 секунд:
    // watch на каждый тик прогресса слишком шумный.
    let lastMediaPositionSyncSeconds = 0;

    watch(
        () => Math.floor(progress.value),
        (seconds) => {
            if (!currentTrack.value || !isPlaying.value) return;

            if (
                seconds !== 0 &&
                Math.abs(seconds - lastMediaPositionSyncSeconds) < 10
            ) {
                return;
            }

            lastMediaPositionSyncSeconds = seconds;

            updateMediaSessionPosition(
                progress.value,
                audioDuration.value,
            );
        },
    );

    watch(() => currentTrack.value?.id, syncMediaSession, {
        immediate: true,
    });

    watch(isPlaying, syncMediaSession);

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

    // Возврат онлайна после старта/сессии без сети: устройство
    // не зарегистрировалось (init упал на запросах к мёртвому
    // серверу), localDeviceId пуст — команды уходили с
    // origin_device_id: null. Сервер снова доступен —
    // догоняем регистрацию, heartbeat и состояние.
    watch(
        () => useNetworkStore().isOnline,
        (isOnline) => {
            if (
                isOnline
                && auth.user
                && localDeviceId.value === null
            ) {
                void initializePlayerDevice();
            }
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
        currentSourceTrack,
        isPlaying,
        isLoading,

        previewNextTrack,
        previewPreviousTrack,

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
