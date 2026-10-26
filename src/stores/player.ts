import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import echo from '@/lib/echo';
import { useAuthStore } from '@/stores/auth';

import {
    type PlaybackState,
    type PlayerDevice,
    type PlayerDeviceType,
} from '@/types/PlayerType';

import {AudioFile, type Track} from '@/types/TrackType';

import {
    getTrackAudio,
    getPlayerState,
    playRemoteTrack,
    pauseRemotePlayback,
    resumeRemotePlayback,
    seekRemotePlayback,
    nextRemoteTrack,
    previousRemoteTrack,
    updatePlaybackOptions,
    getPlayerDevices,
    registerPlayerDevice,
    activatePlayerDevice,
} from '@/api/player';

import {
    getPlayerQueue,
    addTrackToQueue,
    reorderPlayerQueue,
} from '@/api/queue';

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
        source_id: string | null;
        source_type: string;
    };

    const auth = useAuthStore();

    const devices = ref<PlayerDevice[]>([]);
    const localDeviceId = ref<number | null>(null);
    const activeDeviceId = ref<number | null>(null);
    const isDevicesLoading = ref(false);
    const deviceSwitchLoading = ref(false);

    const playbackState = ref<PlaybackState | null>(null);
    const queue = ref<Track[]>([]);
    const currentTrackIndex = ref(-1);
    const currentTrack = ref<PlayerTrack | null>(null);

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
    function createCommandId(): string {
        return crypto.randomUUID();
    }

    watch(volume, (value) => {
        audio.volume = Math.max(0, Math.min(100, value)) / 100;
    });

    let playbackRequestId = 0;
    let restoreRequestId = 0;
    let remoteStateRequestId = 0;
    let favoriteCheckRequestId = 0;
    let favoriteToggleRequestId = 0;

    let deviceInitializationPromise: Promise<void> | null = null;
    let isDeviceChangesSubscribed = false;
    let serverProgressTimer: ReturnType<typeof setInterval> | null = null;
    let lastAppliedVersion: number | null = null;

    function setServerQueueCount(count: number): void {
        serverQueueCount.value = count;
    }

    // ============================================
    // ПРОГРЕСС ВОСПРОИЗВЕДЕНИЯ
    // ============================================

    function stopServerProgressTimer(): void {
        if (serverProgressTimer !== null) {
            clearInterval(serverProgressTimer);
            serverProgressTimer = null;
        }
    }

    function startServerProgressTimer(): void {
        stopServerProgressTimer();

        if (!isPlaying.value) {
            return;
        }

        let lastTick = Date.now();


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

                return;
            }
            const nextProgress = Math.max(0, progress.value + elapsed);

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
     * Заполнение очереди каталогом
     * @param tracks
     */
    function setQueue(tracks: Track[]): void {

        queue.value = [...tracks];

        currentTrackIndex.value = currentTrack.value
            ? queue.value.findIndex(
                track =>
                    String(track.id) === String(currentTrack.value?.id),
            )
            : -1;
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
            await addTrackToQueue(Number(track.id));

            const response = await getPlayerQueue();

            setQueue(response.data.map(item => item.track));
        } catch (error) {
            console.error(
                '[Player] Не удалось добавить трек в очередь:',
                error,
            );

            throw error;
        }
    }

    /**
     * Отчистка очереди??????
     */
    function clearQueue(): void {
        queue.value = [];
        currentTrackIndex.value = -1;
    }

    function findTrackIndex(track: Track): number {
        return queue.value.findIndex(
            (item) => String(item.id) === String(track.id),
        );
    }

    function mapPlaybackTrack(track: Track): PlayerTrack {
        return {
            id: track.id,
            title: track.title,
            artist:
                track.artists?.map((artist) => artist.name).join(', ') ||
                'Неизвестный исполнитель',
            cover: 'cover-purple',
            symbol: '♫',
            source_id: track.source_id,
            source_type: track.source_type,
        };
    }

    function getTrackDuration(track: Track): number {
        const duration = Number(
            track.files?.find((file) => file.variant === 'original')
                ?.duration_seconds ?? track.files?.[0]?.duration_seconds,
        );

        return Number.isFinite(duration) && duration > 0 ? duration : 0;
    }

    // ============================================
    // ИЗБРАННОЕ
    // ============================================

    async function updateFavoriteState(
        trackId: number | string | null,
    ): Promise<void> {
        const requestId = ++favoriteCheckRequestId;

        if (
            trackId === null ||
            typeof trackId !== 'number' ||
            !auth.user
        ) {
            liked.value = false;
            return;
        }

        try {
            const response = await checkFavorite(trackId);

            if (
                requestId !== favoriteCheckRequestId ||
                String(currentTrack.value?.id) !== String(trackId)
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
        const targetTrack = track ?? currentTrack.value;

        if (!targetTrack) {
            return;
        }

        if (
            !track ||
            favoriteLoading.value ||
            typeof track.id !== 'number' ||
            !auth.user
        ) {
            return;
        }

        const isCurrentTrack =
            String(currentTrack.value?.id) === String(targetTrack.id);

        const currentFavoriteState = track
            ? isFavorite
            : liked.value;


        if (currentFavoriteState === undefined) return;

        // Для текущего трека сохраняем защиту плеера.
        if (!track && favoriteLoading.value) return;


        const requestId = ++favoriteToggleRequestId;
        const trackId = Number(targetTrack.id);

        if (!Number.isSafeInteger(trackId) || trackId <= 0) {
            return;
        }

        if (!track) favoriteLoading.value = true;

        try {
            const response = currentFavoriteState
                ? await removeFavorite(trackId)
                : await addFavorite(trackId);

            if (requestId !== favoriteToggleRequestId) return;

            if (
                isCurrentTrack &&
                String(currentTrack.value?.id) === String(trackId)
            ) {
                liked.value = response.is_favorite;
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

            void updateFavoriteState(trackId);
        },
    );



    async function playTrackNext(track: Track): Promise<void> {
        if (!auth.user) return;

        const trackId = Number(track.id);
        if (!Number.isFinite(trackId) || trackId <= 0) return;

        try {
            const added = await addTrackToQueue(trackId);
            const response = await getPlayerQueue();
            const items = [...response.data];

            const targetIndex = items.findIndex(
                (item) => Number(item.id) === Number(added.item.id),
            );

            if (targetIndex < 0) {
                throw new Error('Добавленный трек не найден в очереди.');
            }

            const [target] = items.splice(targetIndex, 1);
            items.unshift(target);

            const reordered = await reorderPlayerQueue(
                items.map((item) => item.id),
            );

            const finalItems = reordered.data ?? items;
            setQueue(finalItems.map((item) => item.track));
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

        try {
            const response = await updatePlaybackOptions({
                shuffle_enabled: !isShuffleEnabled.value,
            });

            await applyRemotePlaybackState(response.state);
        } catch (error) {
            console.error(
                '[Player] Не удалось изменить перемешивание:',
                error,
            );
        }
    }

    async function toggleRepeatMode(): Promise<void> {
        if (!auth.user) return;

        const nextMode =
            repeatMode.value === 'off'
                ? 'all'
                : repeatMode.value === 'all'
                    ? 'one'
                    : 'off';

        try {
            const response = await updatePlaybackOptions({
                repeat_mode: nextMode,
            });

            await applyRemotePlaybackState(response.state);
        } catch (error) {
            console.error('[Player] Не удалось изменить повтор:', error);
        }
    }

    // ============================================
    // СЛЕДУЮЩИЙ / ПРЕДЫДУЩИЙ ТРЕК
    // ============================================

    async function playNext(
        reason: 'manual' | 'ended' = 'manual',
    ): Promise<void> {

        const commandId = createCommandId();

        if (isLoading.value || !auth.user) return;

        isLoading.value = true;

        try {
            const response = await nextRemoteTrack(reason, {
                origin_device_id: localDeviceId.value,
                command_id: commandId,
            });

            await applyRemotePlaybackState(response.state, true);

        } catch (error) {
            console.error('[Player] Ошибка переключения трека:', error);
        } finally {
            isLoading.value = false;
        }
    }

    async function playPrevious(): Promise<void> {
        if (isLoading.value || !auth.user) return;

        if (progress.value > 3) {
            await seekAudio(0);
            return;
        }

        isLoading.value = true;
        let commandId = createCommandId();
        try {
            const response = await previousRemoteTrack({
                origin_device_id: localDeviceId.value,
                command_id: commandId,
            });
            console.log('[PREVIOUS] Ответ сервера', {
                commandId,
                stateTrackId: response.state?.current_track?.id,
                state: response.state,
            });

            await applyRemotePlaybackState(response.state, true);
            console.log('[PREVIOUS] После применения состояния', {
                currentTrackId: currentTrack.value?.id,
                audioSrc: audio.src,
                paused: audio.paused,
                currentTime: audio.currentTime,
            });
        } catch (error) {
            console.error('[Player] Ошибка переключения трека:', error);
        } finally {
            isLoading.value = false;
        }
    }

    // ============================================
    // ЗАПУСК ТРЕКА
    // ============================================
    async function playTrack(track: Track, playbackSource: string): Promise<void> {
        if (!track?.id || !auth.user || isLoading.value) return;

        const requestId = ++playbackRequestId;
        isLoading.value = true;

       let commandId = createCommandId();

        console.log("playbackSource", playbackSource)
        try {
            const selectedTrackId = Number(track.id);

            const response = await playRemoteTrack(
                track,
                playbackSource,
                {
                    origin_device_id: localDeviceId.value,
                    command_id: commandId,
                }
            );

            if (requestId !== playbackRequestId) return;

            console.log('[Player] Запрошен трек:', selectedTrackId);
            console.log('[Player] Сервер вернул трек:', {
                id: response.state.current_track?.id,
                current_track_id: response.state.current_track_id,
            });
            // При явном выборе передаём ID выбранного трека,
            // чтобы не полагаться на уже обновлённый currentTrack.
            await applyRemotePlaybackState(
                response.state,
                true,
                selectedTrackId,
            );
        } catch (error) {
            console.error('[Player] Ошибка запуска трека:', error);
        } finally {
            if (requestId === playbackRequestId) {
                isLoading.value = false;
            }
        }
    }


    // ============================================
    // PLAY / PAUSE
    // ============================================

    async function togglePlay(source: string): Promise<void> {
        if (isLoading.value || !auth.user) return;
        let commandId = createCommandId();

        if (!playbackState.value?.current_track_id && !currentTrack.value) {
            const firstTrack = queue.value[0];

            if (firstTrack) {
                await playTrack(firstTrack,source);
            }

            return;
        }

        isLoading.value = true;

        try {
            const isCurrentlyPlaying = playbackState.value?.is_playing;


            const response = isCurrentlyPlaying
                ? await pauseRemotePlayback(
                    Math.max(0, audio.currentTime || progress.value),
                    {
                        origin_device_id: localDeviceId.value,
                        command_id: commandId,
                    }
                )
                : await resumeRemotePlayback( {
                    origin_device_id: localDeviceId.value,
                    command_id: commandId,
                });


            await applyRemotePlaybackState(response.state, true);
        } catch (error) {
            console.error(
                '[Player] Не удалось изменить состояние воспроизведения:',
                error,
            );
        } finally {
            isLoading.value = false;
        }
    }

    // ============================================
    // ПЕРЕМОТКА
    // ============================================

    async function seekAudio(value: number): Promise<void> {
        if (!Number.isFinite(value) || value < 0 || !auth.user) return;

        let commandId = createCommandId();
        const target =
            audioDuration.value > 0
                ? Math.min(value, audioDuration.value)
                : value;

        isSeeking.value = true;
        progress.value = target;

        try {
            const response = await seekRemotePlayback(target,{
                origin_device_id: localDeviceId.value,
                command_id: commandId,
            });

            await applyRemotePlaybackState(response.state, false);

            progress.value = Math.max(
                0,
                Number(response.state.position_seconds) || 0,
            );

            if (
                isLocalDeviceActive.value &&
                audio.src &&
                audio.readyState >= HTMLMediaElement.HAVE_METADATA
            ) {
                const position = progress.value;

                audio.currentTime = Math.min(
                    position,
                    audio.duration || position,
                );
            }
        } catch (error) {
            console.error('[Player] Ошибка перемотки:', error);
        } finally {
            isSeeking.value = false;
        }
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
            uuid = crypto.randomUUID();
            localStorage.setItem(storageKey, uuid);
        }

        return uuid;
    }

    function getDeviceType(): PlayerDeviceType {
        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
            ? 'phone'
            : 'computer';
    }

    function getOSName(): string {
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

    function getDeviceName(): string {
        return `${getOSName()} — ${getBrowserName()}`;
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

    async function loadDevices(): Promise<void> {
        if (!auth.user) {
            devices.value = [];
            activeDeviceId.value = null;
            localDeviceId.value = null;
            return;
        }

        isDevicesLoading.value = true;

        try {
            const response = await getPlayerDevices();
            devices.value = response.data;

            const activeDevice = devices.value.find(
                (device) => device.is_active,
            );

            activeDeviceId.value = activeDevice?.id ?? null;

            const localDevice = devices.value.find(
                (device) => device.device_uuid === getDeviceUuid(),
            );

            localDeviceId.value = localDevice?.id ?? null;

            if (!isLocalDeviceActive.value) {
                stopLocalPlayback();
            }
        } catch (error) {
            console.error('[Player] Не удалось загрузить устройства:', error);
        } finally {
            isDevicesLoading.value = false;
        }
    }

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

                let currentDevice = devices.value.find(
                    (device) => device.device_uuid === uuid,
                );

                if (!currentDevice) {
                    const registration = await registerPlayerDevice({
                        device_uuid: uuid,
                        name: getDeviceName(),
                        type: getDeviceType(),
                    });

                    currentDevice = registration.device;
                    devices.value = [...devices.value, currentDevice];
                }

                localDeviceId.value = currentDevice.id;
                let commandId = createCommandId()

                const activeDevice = devices.value.find(
                    (device) => device.is_active,
                );

                if (!activeDevice) {
                    await activatePlayerDevice(currentDevice.id,{
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
        let commandId = createCommandId();
        deviceSwitchLoading.value = true;

        try {
            const response = await activatePlayerDevice(deviceId, {
                origin_device_id: localDeviceId.value,
                command_id: commandId,
            });
            await applyRemotePlaybackState(response.state, true);
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

            const queueResponse = await getPlayerQueue();

            if (requestId !== restoreRequestId) return;

            const serverQueue = queueResponse.data.map(
                (item) => item.track,
            );

            if (serverQueue.length > 0) {
                setQueue(serverQueue);
                console.log(
                    '[Player] Очередь восстановлена с сервера:',
                    serverQueue.length,
                );
            } else {
                console.log(
                    '[Player] Серверная очередь пуста — локальную очередь сохраняем:',
                    queue.value.length,
                );
            }
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

        if (Number.isFinite(incomingVersion)) {
            lastAppliedVersion = incomingVersion;
        }

        const requestId = ++remoteStateRequestId;

        playbackState.value = state;
        activeDeviceId.value = state.active_device_id;

        devices.value = devices.value.map((device) => ({
            ...device,
            is_active: device.id === state.active_device_id,
        }));

        isShuffleEnabled.value = state.shuffle_enabled;
        repeatMode.value = state.repeat_mode;
        isPlaying.value = state.is_playing;

        updateServerProgress(state);

        const track = state.current_track;

        if (!track) {
            currentTrack.value = null;
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
        currentTrackIndex.value = findTrackIndex(track);
        audioDuration.value = getTrackDuration(track);

        const sourceMissing =
            !audio.src || audio.src === window.location.href;


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

               // const audioFile = await getTrackAudio(Number(track.id));

                let audioFile = <AudioFile>({});

                if (track.url){
                    audioFile.url = track.url;

                } else {
                    audioFile = await getTrackAudio(Number(track.id));
                }


                if (
                    requestId !== remoteStateRequestId ||
                    !isLocalDeviceActive.value
                ) {
                    return;
                }

                if (!audioFile?.url) {
                    throw new Error('Сервер не вернул ссылку на аудиофайл.');
                }

                audio.src = audioFile.url;
                audio.load();

                await new Promise<void>((resolve, reject) => {
                    let settled = false;
                    let timeout: ReturnType<typeof setTimeout>;

                    const finish = (error?: Error) => {
                        if (settled) return;

                        settled = true;
                        clearTimeout(timeout);

                        audio.removeEventListener(
                            'loadedmetadata',
                            onLoadedMetadata,
                        );

                        audio.removeEventListener('error', onError);

                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    };

                    const onLoadedMetadata = () => finish();
                    const onError = () =>
                        finish(new Error('Не удалось загрузить аудиофайл.'));

                    timeout = setTimeout(() => {
                        finish(new Error('Истекло время загрузки аудио.'));
                    }, 15000);

                    audio.addEventListener(
                        'loadedmetadata',
                        onLoadedMetadata,
                    );

                    audio.addEventListener('error', onError);

                    if (
                        audio.readyState >= HTMLMediaElement.HAVE_METADATA
                    ) {
                        finish();
                    }
                });

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

    function subscribeToDeviceChanges(): void {
        if (!auth.user || isDeviceChangesSubscribed) return;

        const channelName = `App.Models.User.${auth.user.id}`;

        echo.private(channelName)
            .listen(
                '.playback.device.changed',
                async (event: { device_id: number }) => {
                    const deviceId = Number(event.device_id);

                    activeDeviceId.value = deviceId;

                    devices.value = devices.value.map((device) => ({
                        ...device,
                        is_active: device.id === deviceId,
                    }));

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
    // ЭКСПОРТ
    // ============================================

    return {
        queue,
        currentTrackIndex,
        setQueue,
        addToQueue,
        playTrackNext,
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
