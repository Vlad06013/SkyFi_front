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

import { http } from '@/api/http';

import {
    getTracks,
    type Track,
} from '@/api/tracks';

import usePlayerStore from '@/stores/player';
import { uploadTrack as uploadTrackApi } from '@/api/uploads';

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

interface UploadResponse {
    data?: Track;
    track?: Track;
    message?: string;
}

// ============================================
// ЛОГИКА БИБЛИОТЕКИ
// ============================================

export function useLibrary() {
    // ============================================
    // ПЛЕЕР
    // ============================================

    const player = usePlayerStore();

    const playerIsPlaying = computed(() => player.isPlaying);

    const currentTrackId = computed(() => {
        const currentTrack = player.currentTrack;

        if (!currentTrack) {
            return null;
        }

        return typeof currentTrack.id === 'number'
            ? currentTrack.id
            : null;
    });

    function isCurrentTrack(track: Track): boolean {
        return currentTrackId.value === track.id;
    }

    async function playTrack(track: (typeof tracks.value)[number]): Promise<void> {
        if (!track) {
            return;
        }

        try {
            // Передаём в плеер весь список треков библиотеки.
            player.setQueue(tracks.value);

            // Запускаем выбранный трек.
            await player.playTrack(track);
        } catch (error) {
            console.error(
                'Ошибка воспроизведения трека:',
                error,
            );
        }
    }

    async function playTrackFromList(track: (typeof tracks.value)[number]): Promise<void> {
        await playTrack(track);
    }
    // ============================================
    // БИБЛИОТЕКА
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
            const response = await getTracks();

            if (requestId !== libraryRequestId) {
                return;
            }

            const responseData = response.data as unknown;

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
                    'Сервер вернул данные библиотеки в неизвестном формате.',
                );
            }

            tracks.value = receivedTracks as Track[];
        } catch (err: unknown) {
            if (requestId !== libraryRequestId) {
                return;
            }

            console.error(
                'Ошибка загрузки музыкальной коллекции:',
                err,
            );

            if (axios.isAxiosError(err)) {
                if (err.response?.status === 401) {
                    error.value =
                        'Войди в аккаунт, чтобы просматривать свою музыкальную коллекцию.';
                } else if (!err.response) {
                    error.value =
                        'Не удалось подключиться к серверу. Проверь интернет-соединение.';
                } else {
                    error.value =
                        err.response.data?.message ||
                        'Сервер не смог загрузить музыкальную коллекцию.';
                }
            } else {
                error.value =
                    err instanceof Error
                        ? err.message
                        : 'Не удалось получить данные музыкальной коллекции.';
            }
        } finally {
            if (requestId === libraryRequestId) {
                loading.value = false;
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

        if (!extension || !allowedExtensions.includes(extension)) {
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

        // ========================================
        // ВАЛИДАЦИЯ ФОРМЫ
        // ========================================

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

        // После проверки файл гарантированно выбран.
        const audioFile = selectedFile.value;

        if (!audioFile) {
            return;
        }

        uploading.value = true;

        try {
            // ========================================
            // ЗАГРУЗКА ЧЕРЕЗ API-МОДУЛЬ
            // ========================================

            console.log('Отправка аудиофайла:', {
                name: audioFile.name,
                size: audioFile.size,
                type: audioFile.type,
            });

            const response = await uploadTrackApi({
                title: uploadForm.title.trim(),
                artist_name: uploadForm.artist_name.trim(),
                genre_name: uploadForm.genre_name.trim(),
                album_title: uploadForm.album_title.trim() || undefined,
                description: uploadForm.description.trim() || undefined,
                audio: audioFile,
            });

            const uploadedTrack = response.data;

            console.log('Трек успешно загружен:', uploadedTrack);

            uploadSuccess.value = true;

            resetFormAfterUpload();

            await loadLibrary();

            activeTab.value = 'upload';
        } catch (err: unknown) {
            console.error('Ошибка загрузки трека:', err);

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
    // АЛЬБОМЫ
    // ============================================

    const albums = computed<Album[]>(() => {
        const result = new Map<number, Album>();

        for (const track of tracks.value) {
            if (!track.album) {
                continue;
            }

            const albumId =
                (
                    track as Track & {
                        album_id?: number | null;
                    }
                ).album_id ?? track.album.id;

            if (typeof albumId !== 'number') {
                continue;
            }

            const existing = result.get(albumId);

            if (existing) {
                existing.tracksCount++;
                existing.tracks.push(track);
            } else {
                result.set(albumId, {
                    id: albumId,
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
                const existing = result.get(artist.id);

                if (existing) {
                    existing.tracksCount++;
                    existing.tracks.push(track);
                } else {
                    result.set(artist.id, {
                        id: artist.id,
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

    function playAlbum(album: Album): void {
        const firstTrack = album.tracks[0];

        if (firstTrack) {
            void playTrack(firstTrack);
        }
    }

    function playArtist(artistId: number): void {
        const artist = artists.value.find(
            item => item.id === artistId,
        );

        const firstTrack = artist?.tracks[0];

        if (firstTrack) {
            void playTrack(firstTrack);
        }
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
        const index = Math.abs(id) % coverColors.length;
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
    // ПУБЛИЧНЫЙ API ДЛЯ VUE-КОМПОНЕНТА
    // ============================================

    return {
        tabs,
        activeTab,
        openUpload,

        tracks,
        loading,
        error,
        loadLibrary,

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

        albums,
        artists,

        isCurrentTrack,
        playerIsPlaying,
        playTrack,
        playTrackFromList,

        playAlbum,
        playArtist,

        getTrackColor,
        pluralizeTracks,

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