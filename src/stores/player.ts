import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';

import {
    getTrackAudio,
    addFavorite,
    removeFavorite,
    checkFavorite,

    // Глобальный плеер
    getPlayerState,
    playRemoteTrack,
    pauseRemotePlayback,
    resumeRemotePlayback,
    seekRemotePlayback,
    nextRemoteTrack,
    previousRemoteTrack,

    // Очередь
    getPlayerQueue,
    addTrackToQueue,
    removeTrackFromQueue,
    reorderPlayerQueue,

    // Устройства
    getPlayerDevices,
    registerPlayerDevice,
    activatePlayerDevice,
    deletePlayerDevice,

    type Track as ApiTrack,
    type PlaybackState,
    type PlaybackQueueItem,
    type PlayerDevice,
    type PlayerDeviceType,
} from '@/api/tracks';

import { useAuthStore } from '@/stores/auth';

const usePlayerStore = defineStore('player', () => {
    // ============================================
    // ТИПЫ
    // ============================================

    type PlayerTrack = {
        id: number | string;
        title: string;
        artist: string;
        cover?: string;
        symbol?: string;
    };

    // ============================================
    // СОСТОЯНИЕ
    // ============================================

    const auth = useAuthStore();
    // ============================================
    // ГЛОБАЛЬНЫЙ ПЛЕЕР И УСТРОЙСТВА
    // ============================================

    const devices = ref<PlayerDevice[]>([]);

    const activeDeviceId = ref<number | null>(null);

    const isDevicesLoading = ref(false);

    const deviceSwitchLoading = ref(false);

    const playbackState = ref<PlaybackState | null>(null);

    const isServerSyncEnabled = computed(
        () => Boolean(auth.user),
    );

    let deviceInitializationPromise: Promise<void> | null = null;

    let positionSyncTimer: ReturnType<typeof setInterval> | null = null;

    const queue = ref<ApiTrack[]>([]);

    const currentTrackIndex = ref(-1);

    const currentTrack = ref<PlayerTrack | null>(null);

    const isPlaying = ref(false);

    const isLoading = ref(false);

    const progress = ref(0);

    const audioDuration = ref(0);

    const volume = ref(70);

    const liked = ref(false);

    const favoriteLoading = ref(false);

    const isSeeking = ref(false);

    const audio = new Audio();

    audio.preload = 'metadata';
    audio.volume = volume.value / 100;

    let playbackRequestId = 0;

    // Идентификаторы запросов избранного.
    let favoriteCheckRequestId = 0;
    let favoriteToggleRequestId = 0;

    // ============================================
    // ГРОМКОСТЬ
    // ============================================

    watch(volume, (value) => {
        audio.volume = Math.max(0, Math.min(100, value)) / 100;
    });

    // ============================================
    // ОБРАБОТЧИКИ AUDIO
    // ============================================

    audio.addEventListener('timeupdate', () => {
        if (isSeeking.value) {
            return;
        }

        progress.value = Number.isFinite(audio.currentTime)
            ? audio.currentTime
            : 0;
    });

    audio.addEventListener('loadedmetadata', () => {
        audioDuration.value =
            Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.duration
                : 0;
    });

    audio.addEventListener('durationchange', () => {
        audioDuration.value =
            Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.duration
                : 0;
    });

    audio.addEventListener('play', () => {
        isPlaying.value = true;
    });

    audio.addEventListener('pause', () => {
        isPlaying.value = false;
    });

    audio.addEventListener('ended', () => {
        isPlaying.value = false;
        progress.value = audioDuration.value;

        if (currentTrackIndex.value < queue.value.length - 1) {
            void playNext();
        }
    });

    audio.addEventListener('error', () => {
        isPlaying.value = false;
    });

    // ============================================
    // ОЧЕРЕДЬ
    // ============================================

    /**
     * Установить очередь воспроизведения.
     */
    function setQueue(tracks: ApiTrack[]): void {
        queue.value = [...tracks];

        if (!currentTrack.value) {
            currentTrackIndex.value = -1;
            return;
        }

        currentTrackIndex.value = queue.value.findIndex(
            (track) =>
                String(track.id) === String(currentTrack.value?.id),
        );
    }

    /**
     * Очистить очередь воспроизведения.
     */
    function clearQueue(): void {
        console.trace('[Player] Вызван clearQueue()');

        queue.value = [];
        currentTrackIndex.value = -1;
    }

    /**
     * Найти индекс трека в очереди.
     */
    function findTrackIndex(track: ApiTrack): number {
        return queue.value.findIndex(
            (item) => String(item.id) === String(track.id),
        );
    }

    // ============================================
    // ИЗБРАННОЕ
    // ============================================

    /**
     * Проверить, находится ли трек в избранном.
     *
     * Используем идентификатор запроса, чтобы ответ
     * для предыдущего трека не перезаписал состояние
     * текущего.
     */
    async function updateFavoriteState(
        trackId: number | string | null,
    ): Promise<void> {
        const requestId = ++favoriteCheckRequestId;

        if (trackId === null) {
            liked.value = false;
            return;
        }

        if (typeof trackId !== 'number') {
            liked.value = false;
            return;
        }

        if (!auth.user) {
            liked.value = false;
            return;
        }

        try {
            const response = await checkFavorite(trackId);

            if (requestId !== favoriteCheckRequestId) {
                return;
            }

            if (
                String(currentTrack.value?.id) !== String(trackId)
            ) {
                return;
            }

            liked.value = response.is_favorite;
        } catch (error) {
            if (requestId !== favoriteCheckRequestId) {
                return;
            }

            console.error(
                '[Player] Не удалось проверить избранное:',
                error,
            );

            liked.value = false;
        }
    }

    /**
     * Добавить текущий трек в избранное
     * или удалить его из избранного.
     */
    async function toggleFavorite(): Promise<void> {
        const track = currentTrack.value;

        if (
            !track ||
            favoriteLoading.value ||
            typeof track.id !== 'number'
        ) {
            return;
        }

        if (!auth.user) {
            console.warn(
                '[Player] Для работы с избранным необходимо авторизоваться.',
            );
            return;
        }

        const trackId = track.id;
        const wasLiked = liked.value;

        const requestId = ++favoriteToggleRequestId;

        favoriteLoading.value = true;

        try {
            const response = wasLiked
                ? await removeFavorite(trackId)
                : await addFavorite(trackId);

            // Не меняем лайк, если запрос уже устарел
            // или пользователь переключился на другой трек.
            if (requestId !== favoriteToggleRequestId) {
                return;
            }

            if (
                String(currentTrack.value?.id) !== String(trackId)
            ) {
                return;
            }

            liked.value = response.is_favorite;
        } catch (error) {
            console.error(
                '[Player] Ошибка изменения избранного:',
                error,
            );
        } finally {
            if (requestId === favoriteToggleRequestId) {
                favoriteLoading.value = false;
            }
        }
    }

    // ============================================
    // СЛЕДУЮЩИЙ ТРЕК
    // ============================================

    async function playNext(): Promise<void> {
        if (isLoading.value) {
            return;
        }

        if (auth.user) {
            try {
                isLoading.value = true;

                const response = await nextRemoteTrack();

                playbackState.value = response.state;

                const track = response.state.current_track;

                if (!track) {
                    isPlaying.value = false;
                    return;
                }

                await playTrack(track as ApiTrack);
            } catch (error) {
                console.error(
                    '[Player] Ошибка перехода к следующему треку:',
                    error,
                );
            } finally {
                isLoading.value = false;
            }

            return;
        }

        // Офлайн: используем локальную очередь.
        const nextIndex = currentTrackIndex.value + 1;

        if (nextIndex >= queue.value.length) {
            audio.pause();
            isPlaying.value = false;
            return;
        }

        await playTrack(queue.value[nextIndex]);
    }

    // ============================================
    // ПРЕДЫДУЩИЙ ТРЕК
    // ============================================

    async function playPrevious(): Promise<void> {
        if (isLoading.value || queue.value.length === 0) {
            return;
        }

        // Если текущий трек играет больше 3 секунд,
        // начинаем его сначала.
        if (audio.currentTime > 3) {
            seekAudio(0);
            return;
        }

        const previousIndex = currentTrackIndex.value - 1;

        if (previousIndex < 0) {
            seekAudio(0);
            return;
        }

        await playTrack(queue.value[previousIndex]);
    }

    async function addToQueue(track: ApiTrack): Promise<void> {
        if (!auth.user) {
            console.warn('[Player] Для добавления в очередь необходимо авторизоваться.');
            return;
        }

        try {
            await addTrackToQueue(Number(track.id));

            // Получаем актуальную очередь с сервера.
            const response = await getPlayerQueue();

            queue.value = response.data.map((item) => item.track);

            currentTrackIndex.value = currentTrack.value
                ? queue.value.findIndex(
                    (item) => String(item.id) === String(currentTrack.value?.id),
                )
                : -1;

            console.info('[Player] Трек добавлен в очередь:', track.title);
        } catch (error) {
            console.error('[Player] Не удалось добавить трек в очередь:', error);
        }
    }
    // ============================================
// ВОССТАНОВЛЕНИЕ СОСТОЯНИЯ С СЕРВЕРА
// ============================================

    let restoreRequestId = 0;

    const isRestoringState = ref(false);

    /**
     * Восстановить состояние плеера с сервера.
     *
     * Восстанавливаем:
     * - текущий трек;
     * - очередь;
     * - позицию воспроизведения;
     * - аудиоисточник;
     * - активное устройство.
     *
     * Автоматически воспроизведение не запускаем.
     */
    async function restorePlayerState(): Promise<void> {
        if (!auth.user || isRestoringState.value) {
            return;
        }

        const requestId = ++restoreRequestId;

        isRestoringState.value = true;

        try {
            const response = await getPlayerState();

            if (requestId !== restoreRequestId) {
                return;
            }

            const state = response.state;

            playbackState.value = state;
            activeDeviceId.value = state.active_device_id;

            // Загружаем очередь.
            const queueResponse = await getPlayerQueue();

            if (requestId !== restoreRequestId) {
                return;
            }

            queue.value = queueResponse.data.map(
                (item) => item.track,
            );

            const track = state.current_track;

            // На сервере нет текущего трека.
            if (!track) {
                audio.pause();
                audio.removeAttribute('src');
                audio.load();

                currentTrack.value = null;
                currentTrackIndex.value = -1;

                progress.value = 0;
                audioDuration.value = 0;
                isPlaying.value = false;

                return;
            }

            // Восстанавливаем информацию о треке.
            currentTrack.value = {
                id: track.id,
                title: track.title,
                artist:
                    track.artists
                        ?.map((artist) => artist.name)
                        .join(', ') || 'Неизвестный исполнитель',
                cover: 'cover-purple',
                symbol: '♫',
            };

            currentTrackIndex.value = queue.value.findIndex(
                (item) => String(item.id) === String(track.id),
            );

            // Запоминаем серверную позицию.
            const savedPosition = Math.max(
                0,
                Number(state.position_seconds) || 0,
            );

            progress.value = savedPosition;

            audioDuration.value =
                track.duration_seconds ?? 0;

            // Не запускаем аудио автоматически.
            audio.pause();
            audio.removeAttribute('src');
            audio.load();

            isPlaying.value = false;
            isSeeking.value = false;

            // Загружаем источник текущего трека,
            // даже если очередь на сервере пуста.
            const audioFile = await getTrackAudio(track.id);

            if (requestId !== restoreRequestId) {
                return;
            }

            if (!audioFile?.url) {
                throw new Error(
                    'Сервер не вернул ссылку на аудиофайл.',
                );
            }

            audio.src = audioFile.url;
            audio.load();

            // После загрузки метаданных устанавливаем
            // сохранённую позицию в самом HTML Audio.
            const restorePosition = () => {
                if (requestId !== restoreRequestId) {
                    return;
                }

                if (
                    Number.isFinite(audio.duration) &&
                    audio.duration > 0
                ) {
                    audio.currentTime = Math.min(
                        savedPosition,
                        audio.duration,
                    );

                    progress.value = audio.currentTime;
                    audioDuration.value = audio.duration;
                }
            };

            if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
                restorePosition();
            } else {
                audio.addEventListener(
                    'loadedmetadata',
                    restorePosition,
                    { once: true },
                );
            }

            void updateFavoriteState(track.id);

            console.info(
                '[Player] Состояние восстановлено:',
                track.title,
                'Позиция:',
                savedPosition,
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
    // ВОСПРОИЗВЕДЕНИЕ
    // ============================================

    async function playTrack(track: ApiTrack): Promise<void> {
        if (!track || track.id == null) {
            console.error('[Player] Не передан трек или его ID:', track);
            return;
        }

        const trackId = track.id;

        // Отменяем предыдущие запросы воспроизведения.
        const requestId = ++playbackRequestId;

        console.log('[Player] Запрос воспроизведения:', {
            id: trackId,
            title: track.title,
        });

        // Проверяем, есть ли трек в очереди.
        let index = findTrackIndex(track);

        // Если трека нет в очереди, добавляем его.
        // Это важно для треков из избранного и загрузок.
        if (index === -1) {
            queue.value = [
                track,
                ...queue.value.filter(
                    item => String(item.id) !== String(trackId),
                ),
            ];

            index = 0;
        }

        currentTrackIndex.value = index;

        // Обновляем текущий трек.
        currentTrack.value = {
            id: track.id,
            title: track.title,
            artist:
                track.artists
                    ?.map(artist => artist.name)
                    .join(', ') || 'Неизвестный исполнитель',
            cover: 'cover-purple',
            symbol: '♫',
        };

        liked.value = false;

        void updateFavoriteState(trackId);

        isPlaying.value = false;
        isLoading.value = true;

        progress.value = 0;
        audioDuration.value = 0;
        isSeeking.value = false;

        // Останавливаем предыдущее воспроизведение.
        audio.pause();
        audio.removeAttribute('src');
        audio.load();

        try {
            // Получаем URL аудиофайла.
            const audioFile = await getTrackAudio(Number(trackId));

            // Если за время запроса пользователь выбрал другой трек,
            // не запускаем предыдущий.
            if (requestId !== playbackRequestId) {
                return;
            }

            if (!audioFile?.url) {
                throw new Error(
                    `Сервер не вернул URL аудиофайла для трека ${trackId}.`,
                );
            }

            // Устанавливаем источник.
            audio.src = audioFile.url;
            audio.volume = Math.max(
                0,
                Math.min(100, volume.value),
            ) / 100;

            audio.load();

            // Запускаем локальное воспроизведение.
            await audio.play();

            // Пока запускался звук, пользователь мог выбрать
            // другой трек. Не синхронизируем устаревший запрос.
            if (requestId !== playbackRequestId) {
                return;
            }

            console.log(
                '[Player] Воспроизведение запущено:',
                track.title,
            );

            // Синхронизируем глобальный плеер с сервером.
            if (auth.user) {
                try {
                    const response = await playRemoteTrack(
                        Number(trackId),
                        activeDeviceId.value ?? undefined,
                    );

                    if (requestId === playbackRequestId) {
                        playbackState.value = response.state;
                    }
                } catch (error) {
                    // Ошибка синхронизации сервера не должна
                    // останавливать уже работающий локальный звук.
                    console.error(
                        '[Player] Ошибка синхронизации с сервером:',
                        error,
                    );
                }
            }
        } catch (error) {
            if (requestId !== playbackRequestId) {
                return;
            }

            audio.pause();
            isPlaying.value = false;

            console.error(
                '[Player] Не удалось воспроизвести трек:',
                {
                    id: trackId,
                    title: track.title,
                    error,
                },
            );
        } finally {
            if (requestId === playbackRequestId) {
                isLoading.value = false;
            }
        }
    }

    // ============================================
    // PLAY / PAUSE
    // ============================================

    async function togglePlay(): Promise<void> {
        if (isLoading.value) {
            return;
        }

        // Если текущий трек не выбран, берём первый из очереди.
        if (!currentTrack.value) {
            const firstTrack = queue.value[0];

            if (firstTrack) {
                await playTrack(firstTrack);
            }

            return;
        }

        // Если после обновления страницы аудиоисточник
        // ещё не подготовлен, восстанавливаем его.
        if (
            !audio.src ||
            audio.src === window.location.href
        ) {
            const trackId = currentTrack.value.id;

            const track =
                queue.value.find(
                    (item) => String(item.id) === String(trackId),
                ) ??
                (
                    playbackState.value?.current_track &&
                    String(playbackState.value.current_track.id) ===
                    String(trackId)
                        ? playbackState.value.current_track
                        : null
                );

            if (!track) {
                console.warn(
                    '[Player] Не удалось найти текущий трек.',
                );

                return;
            }

            isLoading.value = true;

            const savedPosition = Math.max(
                0,
                progress.value,
            );

            try {
                const audioFile = await getTrackAudio(track.id);

                if (!audioFile?.url) {
                    throw new Error(
                        'Сервер не вернул ссылку на аудиофайл.',
                    );
                }

                audio.src = audioFile.url;
                audio.load();

                // Ждём метаданные, чтобы восстановить позицию.
                if (
                    audio.readyState <
                    HTMLMediaElement.HAVE_METADATA
                ) {
                    await new Promise<void>((resolve, reject) => {
                        const onLoadedMetadata = () => {
                            cleanup();
                            resolve();
                        };

                        const onError = () => {
                            cleanup();

                            reject(
                                new Error(
                                    'Не удалось загрузить аудиофайл.',
                                ),
                            );
                        };

                        const cleanup = () => {
                            audio.removeEventListener(
                                'loadedmetadata',
                                onLoadedMetadata,
                            );

                            audio.removeEventListener(
                                'error',
                                onError,
                            );
                        };

                        audio.addEventListener(
                            'loadedmetadata',
                            onLoadedMetadata,
                            { once: true },
                        );

                        audio.addEventListener(
                            'error',
                            onError,
                            { once: true },
                        );
                    });
                }

                if (
                    Number.isFinite(audio.duration) &&
                    audio.duration > 0
                ) {
                    audio.currentTime = Math.min(
                        savedPosition,
                        audio.duration,
                    );
                }

                progress.value = audio.currentTime;

                await audio.play();

                // Синхронизируем команду продолжения с сервером.
                if (auth.user) {
                    try {
                        const response =
                            await resumeRemotePlayback();

                        playbackState.value = response.state;
                    } catch (error) {
                        console.error(
                            '[Player] Не удалось синхронизировать воспроизведение:',
                            error,
                        );
                    }
                }
            } catch (error) {
                console.error(
                    '[Player] Ошибка восстановления воспроизведения:',
                    error,
                );

                isPlaying.value = false;
            } finally {
                isLoading.value = false;
            }

            return;
        }

        // Источник аудио уже подготовлен.
        if (audio.paused) {
            try {
                await audio.play();

                if (auth.user) {
                    try {
                        const response =
                            await resumeRemotePlayback();

                        playbackState.value = response.state;
                    } catch (error) {
                        console.error(
                            '[Player] Не удалось синхронизировать воспроизведение:',
                            error,
                        );
                    }
                }
            } catch (error) {
                console.error(
                    '[Player] Ошибка запуска воспроизведения:',
                    error,
                );

                isPlaying.value = false;
            }
        } else {
            audio.pause();

            if (auth.user) {
                try {
                    const response =
                        await pauseRemotePlayback();

                    playbackState.value = response.state;
                } catch (error) {
                    console.error(
                        '[Player] Не удалось синхронизировать паузу:',
                        error,
                    );
                }
            }
        }
    }

    // ============================================
    // ПЕРЕМОТКА
    // ============================================

    function seekAudio(value: number): void {
        if (
            !Number.isFinite(audio.duration) ||
            audio.duration <= 0
        ) {
            return;
        }

        const target = Math.max(
            0,
            Math.min(value, audio.duration),
        );

        audio.currentTime = target;
        if (auth.user) {
            void seekRemotePlayback(target)
                .then((response) => {
                    playbackState.value = response.state;
                })
                .catch((error) => {
                    console.error(
                        '[Player] Не удалось синхронизировать позицию:',
                        error,
                    );
                });
        }

        progress.value = target;

        isSeeking.value = false;
    }

    // ============================================
    // ВРЕМЯ
    // ============================================

    function formatTime(value: number): string {
        if (!Number.isFinite(value) || value < 0) {
            return '0:00';
        }

        const seconds = Math.floor(value);
        const minutes = Math.floor(seconds / 60);
        const remainder = seconds % 60;

        return `${minutes}:${String(remainder).padStart(2, '0')}`;
    }

    // ============================================
    // ПРОГРЕСС
    // ============================================

    const progressPercent = computed(() => {
        if (audioDuration.value <= 0) {
            return 0;
        }

        return Math.min(
            100,
            (progress.value / audioDuration.value) * 100,
        );
    });

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
        return /Android|iPhone|iPad|iPod/i.test(
            navigator.userAgent,
        )
            ? 'phone'
            : 'computer';
    }

    function getDeviceName(): string {
        return getDeviceType() === 'phone'
            ? 'SkyFi — мобильное устройство'
            : 'SkyFi — браузер';
    }

    async function loadDevices(): Promise<void> {
        if (!auth.user) {
            devices.value = [];
            activeDeviceId.value = null;
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
        } catch (error) {
            console.error(
                '[Player] Не удалось загрузить устройства:',
                error,
            );
        } finally {
            isDevicesLoading.value = false;
        }
    }

    async function initializePlayerDevice(): Promise<void> {
        if (!auth.user) {
            return;
        }

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

                    devices.value = [
                        ...devices.value,
                        currentDevice,
                    ];
                }

                if (!currentDevice.is_active) {
                    const response = await activatePlayerDevice(
                        currentDevice.id,
                    );

                    playbackState.value = response.state;
                }

                activeDeviceId.value = currentDevice.id;

                await loadDevices();

                await restorePlayerState();
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
            deviceId === activeDeviceId.value
        ) {
            return;
        }

        deviceSwitchLoading.value = true;

        try {
            const response = await activatePlayerDevice(deviceId);

            playbackState.value = response.state;

            activeDeviceId.value = deviceId;

            await loadDevices();
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
    // СИНХРОНИЗАЦИЯ ИЗБРАННОГО
    // ============================================

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

    // ============================================
    // ЭКСПОРТ
    // ============================================

    return {
        // Очередь
        queue,
        currentTrackIndex,
        setQueue,
        clearQueue,

        // Текущий трек
        currentTrack,

        // Состояние воспроизведения
        isPlaying,
        isLoading,

        // Прогресс и время
        progress,
        audioDuration,
        progressPercent,

        // Громкость
        volume,

        // Избранное
        liked,
        favoriteLoading,
        updateFavoriteState,
        toggleFavorite,

        // Перемотка
        isSeeking,
        seekAudio,

        // Управление воспроизведением
        playTrack,
        playNext,
        playPrevious,
        togglePlay,

        // Форматирование
        formatTime,

        // Глобальный плеер
        devices,
        activeDeviceId,
        isDevicesLoading,
        deviceSwitchLoading,
        playbackState,
        isServerSyncEnabled,

        initializePlayerDevice,
        loadDevices,
        switchDevice,
        // Восстановление состояния
        restorePlayerState,
        isRestoringState,
        addToQueue
    };
});

export default usePlayerStore;