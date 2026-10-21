import {
    computed,
    onMounted,
    reactive,
    ref,
} from 'vue';

import {
    musicalNotesOutline,
    discOutline,
    cloudUploadOutline,
    checkmarkCircleOutline,
    alertCircleOutline,
    informationCircleOutline,
    chevronForwardOutline,
    refreshOutline,
    playOutline,
    pauseOutline,
    peopleOutline,
} from 'ionicons/icons';

import axios from 'axios';

import {
    getUploadedTracks,
    uploadTrack as uploadTrackApi,
} from '@/api/uploads';

import type {Track} from '@/api/tracks';
import {getFavorites} from '@/api/favorites';

import usePlayerStore from '@/stores/player';

// ============================================
// ТИПЫ
// ============================================

type LibraryTab = 'tracks' | 'albums' | 'artists' | 'upload';

interface Album {
    id: number;
    title: string;
    tracksCount: number;
    tracks: Track[];
}

interface LibraryArtist {
    id: number;
    name: string;
    tracksCount: number;
    tracks: Track[];
}

// ============================================
// ЛОГИКА БИБЛИОТЕКИ
// ============================================

export function useLibrary() {
    // ============================================
    // ПЛЕЕР
    // ============================================

    const player = usePlayerStore();

    const playerIsPlaying = computed(
        () => player.isPlaying,
    );

    const currentTrackId = computed<number | null>(() => {
        const currentTrack = player.currentTrack;

        if (
            !currentTrack ||
            currentTrack.id === undefined ||
            currentTrack.id === null
        ) {
            return null;
        }

        const id = Number(currentTrack.id);

        return Number.isFinite(id) ? id : null;
    });

    /**
     * Сравниваем числовые ID.
     *
     * Например, 12 и "12" должны считаться одним треком.
     */
    function isCurrentTrack(track: Track): boolean {
        if (
            !track ||
            track.id === undefined ||
            track.id === null
        ) {
            return false;
        }

        return currentTrackId.value === Number(track.id);
    }

    // ============================================
    // ИЗБРАННОЕ
    // ============================================

    const tracks = ref<Track[]>([]);
    const loading = ref(false);
    const error = ref('');

    let libraryRequestId = 0;

    async function loadLibrary(): Promise<void> {
        const requestId = ++libraryRequestId;

        loading.value = true;
        error.value = '';

        try {
            const response = await getFavorites();

            if (requestId !== libraryRequestId) {
                return;
            }

            const responseData: unknown = response.data;

            let receivedTracks: unknown = responseData;

            if (
                responseData &&
                typeof responseData === 'object' &&
                !Array.isArray(responseData)
            ) {
                const payload = responseData as {
                    data?: unknown;
                    tracks?: unknown;
                };

                if (Array.isArray(payload.data)) {
                    receivedTracks = payload.data;
                } else if (Array.isArray(payload.tracks)) {
                    receivedTracks = payload.tracks;
                }
            }

            if (!Array.isArray(receivedTracks)) {
                throw new Error(
                    'Сервер вернул данные избранного в неизвестном формате.',
                );
            }

            tracks.value = receivedTracks as Track[];
        } catch (err: unknown) {
            if (requestId !== libraryRequestId) {
                return;
            }

            console.error(
                '[Library] Ошибка загрузки избранного:',
                err,
            );

            if (axios.isAxiosError(err)) {
                if (err.response?.status === 401) {
                    error.value =
                        'Войди в аккаунт, чтобы просматривать избранное.';
                } else if (!err.response) {
                    error.value =
                        'Не удалось подключиться к серверу. Проверь интернет-соединение.';
                } else {
                    error.value =
                        err.response.data?.message ||
                        'Не удалось загрузить избранное.';
                }
            } else {
                error.value = err instanceof Error
                    ? err.message
                    : 'Не удалось получить данные избранного.';
            }
        } finally {
            if (requestId === libraryRequestId) {
                loading.value = false;
            }
        }
    }

    // ============================================
    // СОБСТВЕННЫЕ ЗАГРУЗКИ
    // ============================================

    const uploadedTracks = ref<Track[]>([]);
    const uploadsLoading = ref(false);
    const uploadsError = ref('');

    let uploadsRequestId = 0;

    async function loadUploadedTracks(): Promise<void> {
        const requestId = ++uploadsRequestId;

        uploadsLoading.value = true;
        uploadsError.value = '';

        try {
            const response = await getUploadedTracks();

            if (requestId !== uploadsRequestId) {
                return;
            }

            const responseData: unknown = response.data;

            let receivedTracks: unknown = responseData;

            if (
                responseData &&
                typeof responseData === 'object' &&
                !Array.isArray(responseData)
            ) {
                const payload = responseData as {
                    data?: unknown;
                    tracks?: unknown;
                };

                if (Array.isArray(payload.data)) {
                    receivedTracks = payload.data;
                } else if (Array.isArray(payload.tracks)) {
                    receivedTracks = payload.tracks;
                }
            }

            if (!Array.isArray(receivedTracks)) {
                throw new Error(
                    'Сервер вернул список загрузок в неизвестном формате.',
                );
            }

            uploadedTracks.value = receivedTracks as Track[];
        } catch (err: unknown) {
            if (requestId !== uploadsRequestId) {
                return;
            }

            console.error(
                '[Library] Ошибка загрузки собственных треков:',
                err,
            );

            if (axios.isAxiosError(err)) {
                if (err.response?.status === 401) {
                    uploadsError.value =
                        'Войди в аккаунт, чтобы просматривать свои загрузки.';
                } else if (!err.response) {
                    uploadsError.value =
                        'Не удалось подключиться к серверу.';
                } else {
                    uploadsError.value =
                        err.response.data?.message ||
                        'Не удалось загрузить список треков.';
                }
            } else {
                uploadsError.value = err instanceof Error
                    ? err.message
                    : 'Произошла ошибка при загрузке треков.';
            }
        } finally {
            if (requestId === uploadsRequestId) {
                uploadsLoading.value = false;
            }
        }
    }

    // ============================================
    // ВКЛАДКИ
    // ============================================

    const tabs: {
        label: string;
        value: LibraryTab;
        icon?: string;
    }[] = [
        {
            label: 'Треки',
            value: 'tracks',
            icon: musicalNotesOutline,
        },
        {
            label: 'Альбомы',
            value: 'albums',
            icon: discOutline,
        },
        {
            label: 'Исполнители',
            value: 'artists',
            icon: peopleOutline,
        },
    ];

    const activeTab = ref<LibraryTab>('tracks');

    // ============================================
    // ЗАГРУЗКА ТРЕКА
    // ============================================

    const fileInput = ref<HTMLInputElement | null>(null);
    const selectedFile = ref<File | null>(null);

    const uploading = ref(false);
    const uploadSuccess = ref(false);
    const uploadError = ref('');

    const fieldErrors = reactive<Record<string, string>>({});

    const uploadForm = reactive({
        title: '',
        artist_name: '',
        album_title: '',
        genre_name: '',
        description: '',
    });

    const allowedExtensions = [
        'mp3',
        'wav',
        'ogg',
        'flac',
        'm4a',
        'aac',
    ];

    const MAX_FILE_SIZE = 100 * 1024 * 1024;

    function clearFieldErrors(): void {
        for (const key of Object.keys(fieldErrors)) {
            delete fieldErrors[key];
        }
    }

    function openUpload(): void {
        activeTab.value = 'upload';

        uploadSuccess.value = false;
        uploadError.value = '';

        clearFieldErrors();

        void loadUploadedTracks();
    }

    function handleFileChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0] ?? null;

        uploadSuccess.value = false;
        uploadError.value = '';

        delete fieldErrors.audio;

        if (!file) {
            selectedFile.value = null;
            return;
        }

        const extension = file.name
            .split('.')
            .pop()
            ?.toLowerCase();

        if (
            !extension ||
            !allowedExtensions.includes(extension)
        ) {
            selectedFile.value = null;

            fieldErrors.audio =
                'Выбери аудиофайл MP3, WAV, OGG, FLAC, M4A или AAC.';

            input.value = '';
            return;
        }

        if (file.size === 0) {
            selectedFile.value = null;

            fieldErrors.audio =
                'Выбранный файл пуст. Выбери другой аудиофайл.';

            input.value = '';
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            selectedFile.value = null;

            fieldErrors.audio =
                'Размер файла превышает 100 МБ. Выбери файл меньшего размера.';

            input.value = '';
            return;
        }

        selectedFile.value = file;
    }

    function formatFileSize(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} Б`;
        }

        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} КБ`;
        }

        if (bytes < 1024 * 1024 * 1024) {
            return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
        }

        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
    }

    function resetUploadForm(): void {
        if (uploading.value) {
            return;
        }

        uploadForm.title = '';
        uploadForm.artist_name = '';
        uploadForm.album_title = '';
        uploadForm.genre_name = '';
        uploadForm.description = '';

        selectedFile.value = null;
        uploadSuccess.value = false;
        uploadError.value = '';

        clearFieldErrors();

        if (fileInput.value) {
            fileInput.value.value = '';
        }
    }

    function resetFormAfterUpload(): void {
        uploadForm.title = '';
        uploadForm.artist_name = '';
        uploadForm.album_title = '';
        uploadForm.genre_name = '';
        uploadForm.description = '';

        selectedFile.value = null;

        clearFieldErrors();

        if (fileInput.value) {
            fileInput.value.value = '';
        }
    }

    // ============================================
    // ОТПРАВКА МУЗЫКИ НА СЕРВЕР
    // ============================================

    async function uploadTrack(): Promise<void> {
        if (uploading.value) {
            return;
        }

        uploadSuccess.value = false;
        uploadError.value = '';

        clearFieldErrors();

        if (!uploadForm.title.trim()) {
            fieldErrors.title = 'Укажи название трека.';
        }

        if (!uploadForm.artist_name.trim()) {
            fieldErrors.artist_name = 'Укажи исполнителя.';
        }

        if (!uploadForm.genre_name.trim()) {
            fieldErrors.genre_name = 'Укажи жанр.';
        }

        if (!selectedFile.value) {
            fieldErrors.audio = 'Выбери аудиофайл.';
        } else if (selectedFile.value.size === 0) {
            fieldErrors.audio = 'Выбранный аудиофайл пуст.';
        }

        if (Object.keys(fieldErrors).length > 0) {
            return;
        }

        const audioFile = selectedFile.value;

        if (!audioFile) {
            return;
        }

        uploading.value = true;

        try {
            const response = await uploadTrackApi({
                title: uploadForm.title.trim(),
                artist_name: uploadForm.artist_name.trim(),
                genre_name: uploadForm.genre_name.trim(),
                album_title:
                    uploadForm.album_title.trim() || undefined,
                description:
                    uploadForm.description.trim() || undefined,
                audio: audioFile,
            });

            console.log(
                '[Library] Трек успешно загружен:',
                response.data,
            );

            uploadSuccess.value = true;

            resetFormAfterUpload();


            activeTab.value = 'upload';
        } catch (err: unknown) {
            console.error(
                '[Library] Ошибка загрузки трека:',
                err,
            );

            if (axios.isAxiosError(err)) {
                const response = err.response;

                if (response?.status === 401) {
                    uploadError.value =
                        'Для загрузки музыки необходимо войти в аккаунт.';
                } else if (response?.status === 413) {
                    uploadError.value =
                        'Файл слишком большой. Уменьши его размер и попробуй снова.';
                } else if (response?.status === 422) {
                    const errors = response.data?.errors;

                    if (errors && typeof errors === 'object') {
                        for (const [field, messages] of Object.entries(
                            errors as Record<string, unknown>,
                        )) {
                            const message = Array.isArray(messages)
                                ? messages[0]
                                : messages;

                            if (typeof message === 'string') {
                                fieldErrors[field] = message;
                            }
                        }
                    }

                    uploadError.value =
                        response.data?.message ||
                        'Проверь заполненные поля и выбранный файл.';
                } else if (!response) {
                    uploadError.value =
                        'Не удалось подключиться к серверу. Проверь интернет-соединение.';
                } else {
                    uploadError.value =
                        response.data?.message ||
                        'Сервер не смог обработать загрузку. Попробуй ещё раз.';
                }
            } else if (err instanceof Error) {
                uploadError.value = err.message;
            } else {
                uploadError.value =
                    'Произошла непредвиденная ошибка. Попробуй ещё раз.';
            }
        } finally {
            uploading.value = false;
        }
    }

    // ============================================
    // ВОСПРОИЗВЕДЕНИЕ МУЗЫКИ
    // ============================================

    /**
     * Главная функция воспроизведения.
     *
     * Сначала устанавливает очередь.
     * Затем передаёт выбранный трек в хранилище плеера.
     */
    async function playTrack(
        track: Track,
        queue: Track[] = tracks.value,
    ): Promise<void> {
        console.log('[Library] playTrack вызван:', {
            track,
            queueLength: queue.length,
        });

        if (
            !track ||
            track.id === undefined ||
            track.id === null
        ) {
            console.error(
                '[Library] Воспроизведение отменено: у трека нет ID.',
                track,
            );

            return;
        }

        try {
            // Не допускаем пустую очередь.
            const validQueue = Array.isArray(queue)
                ? [...queue]
                : [];

            // Если выбранного трека нет в очереди, добавляем его.
            const trackExists = validQueue.some(
                item => Number(item.id) === Number(track.id),
            );

            if (!trackExists) {
                validQueue.unshift(track);
            }

            console.log(
                '[Library] Устанавливаем очередь:',
                validQueue,
            );

            player.setQueue(validQueue);

            console.log(
                '[Library] Запускаем воспроизведение:',
                track.id,
            );

            await player.playTrack(track);

            console.log(
                '[Library] Вызов плеера завершён.',
            );
        } catch (err: unknown) {
            console.error(
                '[Library] Ошибка воспроизведения:',
                err,
            );

            throw err;
        }
    }

    /**
     * Воспроизведение трека из пользовательских загрузок.
     */
    async function playUploadedTrack(
        track: Track,
    ): Promise<void> {
        await playTrack(track, uploadedTracks.value);
    }

    /**
     * Совместимость с прежним названием функции.
     */
    async function playTrackFromList(
        track: Track,
    ): Promise<void> {
        await playTrack(track, tracks.value);
    }

    // ============================================
    // ДОБАВЛЕНИЕ В ОЧЕРЕДЬ
    // ============================================

    const queueLoadingTrackId = ref<number | null>(null);

    async function addTrackToQueueFromLibrary(
        track: Track,
    ): Promise<void> {
        const trackId = Number(track?.id);

        if (
            !track ||
            !Number.isFinite(trackId) ||
            trackId <= 0
        ) {
            console.error(
                '[Library] Некорректный ID трека:',
                track,
            );
            return;
        }

        queueLoadingTrackId.value = trackId;

        try {
            await player.addToQueue(track);

            console.log(
                '[Library] Трек добавлен в серверную очередь:',
                track.title,
            );
        } catch (err: unknown) {
            console.error(
                '[Library] Ошибка добавления трека в очередь:',
                err,
            );
        } finally {
            queueLoadingTrackId.value = null;
        }
    }


    // async function addTrackToQueueFromLibrary(
    //     track: Track,
    // ): Promise<void> {
    //     const trackId = Number(track?.id);
    //
    //     if (
    //         !track ||
    //         !Number.isFinite(trackId) ||
    //         trackId <= 0
    //     ) {
    //         console.error(
    //             '[Library] Нельзя добавить в очередь трек без корректного ID:',
    //             track,
    //         );
    //
    //         return;
    //     }
    //
    //     queueLoadingTrackId.value = trackId;
    //
    //     try {
    //         /*
    //          * В исходном файле реализация добавления в очередь
    //          * отсутствовала, хотя функция использовалась в шаблоне.
    //          *
    //          * Добавляем трек через доступное API плеера:
    //          * устанавливаем очередь с выбранным треком.
    //          *
    //          * Если в хранилище есть специальный метод addToQueue,
    //          * его использование можно настроить по коду stores/player.
    //          */
    //         const currentQueue = [
    //             ...tracks.value,
    //         ];
    //
    //         const uploadedQueue = [
    //             ...uploadedTracks.value,
    //         ];
    //
    //         const combinedQueue = [
    //             ...currentQueue,
    //             ...uploadedQueue,
    //         ];
    //
    //         const alreadyInQueue = combinedQueue.some(
    //             item => Number(item.id) === trackId,
    //         );
    //
    //         if (!alreadyInQueue) {
    //             combinedQueue.push(track);
    //         }
    //
    //         player.setQueue(combinedQueue);
    //
    //         console.log(
    //             '[Library] Очередь обновлена:',
    //             track.title,
    //         );
    //     } catch (err: unknown) {
    //         console.error(
    //             '[Library] Ошибка добавления трека в очередь:',
    //             err,
    //         );
    //     } finally {
    //         queueLoadingTrackId.value = null;
    //     }
    // }

    // ============================================
    // АЛЬБОМЫ
    // ============================================

    const albums = computed<Album[]>(() => {
        const result = new Map<number, Album>();

        for (const track of tracks.value) {
            if (!track.album) {
                continue;
            }

            const albumId = (
                track as Track & {
                    album_id?: number | null;
                }
            ).album_id ?? track.album.id;

            if (
                albumId === undefined ||
                albumId === null
            ) {
                continue;
            }

            const normalizedAlbumId = Number(albumId);

            if (!Number.isFinite(normalizedAlbumId)) {
                continue;
            }

            const existing = result.get(normalizedAlbumId);

            if (existing) {
                existing.tracksCount++;
                existing.tracks.push(track);
            } else {
                result.set(normalizedAlbumId, {
                    id: normalizedAlbumId,
                    title: track.album.title,
                    tracksCount: 1,
                    tracks: [track],
                });
            }
        }

        return Array.from(result.values()).sort(
            (a, b) => a.title.localeCompare(b.title, 'ru'),
        );
    });

    // ============================================
    // ИСПОЛНИТЕЛИ
    // ============================================

    const artists = computed<LibraryArtist[]>(() => {
        const result = new Map<number, LibraryArtist>();

        for (const track of tracks.value) {
            for (const artist of track.artists ?? []) {
                const artistId = Number(artist.id);

                if (!Number.isFinite(artistId)) {
                    continue;
                }

                const existing = result.get(artistId);

                if (existing) {
                    existing.tracksCount++;
                    existing.tracks.push(track);
                } else {
                    result.set(artistId, {
                        id: artistId,
                        name: artist.name,
                        tracksCount: 1,
                        tracks: [track],
                    });
                }
            }
        }

        return Array.from(result.values()).sort(
            (a, b) => a.name.localeCompare(b.name, 'ru'),
        );
    });

    // ============================================
    // ВОСПРОИЗВЕДЕНИЕ АЛЬБОМА
    // ============================================

    function playAlbum(album: Album): void {
        const firstTrack = album.tracks[0];

        if (firstTrack) {
            void playTrack(firstTrack, album.tracks);
        }
    }

    // ============================================
    // ВОСПРОИЗВЕДЕНИЕ ИСПОЛНИТЕЛЯ
    // ============================================

    function playArtist(artistId: number): void {
        const artist = artists.value.find(
            item => Number(item.id) === Number(artistId),
        );

        if (!artist || artist.tracks.length === 0) {
            console.warn(
                '[Library] У исполнителя нет треков:',
                artistId,
            );

            return;
        }

        const firstTrack = artist.tracks[0];

        void playTrack(firstTrack, artist.tracks);
    }

    // ============================================
    // ОФОРМЛЕНИЕ
    // ============================================

    const coverColors = [
        '#6546B8',
        '#277D8A',
        '#A04C72',
        '#B26A38',
        '#3569A8',
        '#47865C',
        '#8157A6',
        '#B64E61',
        '#4B65B5',
        '#337E75',
    ];

    function getTrackColor(id: number): string {
        const normalizedId = Number(id);

        if (!Number.isFinite(normalizedId)) {
            return coverColors[0];
        }

        const index =
            Math.abs(normalizedId) % coverColors.length;

        return coverColors[index];
    }

    function pluralizeTracks(count: number): string {
        const lastTwo = count % 100;

        if (lastTwo >= 11 && lastTwo <= 14) {
            return 'треков';
        }

        const lastDigit = count % 10;

        if (lastDigit === 1) {
            return 'трек';
        }

        if (lastDigit >= 2 && lastDigit <= 4) {
            return 'трека';
        }

        return 'треков';
    }

    // ============================================
    // ИНИЦИАЛИЗАЦИЯ
    // ============================================

    onMounted(() => {
        void loadLibrary();
    });


    // ============================================
    // ПУБЛИЧНЫЙ API
    // ============================================

    return {
        tabs,
        activeTab,
        openUpload,

        // Избранное
        tracks,
        loading,
        error,
        loadLibrary,

        // Собственные загрузки
        uploadedTracks,
        uploadsLoading,
        uploadsError,
        loadUploadedTracks,
        playUploadedTrack,

        // Форма загрузки
        uploadSuccess,
        uploadError,
        uploadForm,
        uploading,
        fieldErrors,
        selectedFile,
        fileInput,

        handleFileChange,
        formatFileSize,
        resetUploadForm,
        uploadTrack,

        // Коллекции
        albums,
        artists,

        // Плеер
        isCurrentTrack,
        playerIsPlaying,
        playTrack,
        playTrackFromList,
        playAlbum,
        playArtist,

        // Очередь
        addTrackToQueueFromLibrary,
        queueLoadingTrackId,

        // Оформление
        getTrackColor,
        pluralizeTracks,

        // Иконки
        musicalNotesOutline,
        discOutline,
        cloudUploadOutline,
        checkmarkCircleOutline,
        alertCircleOutline,
        informationCircleOutline,
        chevronForwardOutline,
        refreshOutline,
        playOutline,
        pauseOutline,
        peopleOutline,
    };
}