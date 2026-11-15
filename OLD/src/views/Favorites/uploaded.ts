import { reactive, ref, type Ref } from 'vue';
import axios from 'axios';

import type { Track } from '@/types/TrackType';

import {
    alertCircleOutline,
    checkmarkCircleOutline,
    chevronForwardOutline,
    cloudUploadOutline,
    discOutline,
    informationCircleOutline,
    musicalNotesOutline,
    pauseOutline,
    peopleOutline,
    playOutline,
    refreshOutline,
} from 'ionicons/icons';

import {
    getUploadedTracks,
    uploadTrack as uploadTrackApi,
} from '@/api/uploads';

import {
    searchAlbums,
    searchArtists,
    searchGenres,
} from '@/api/catalog';

import {
    useAutocomplete,
    type AutocompleteOption,
} from './useAutocomplete';

interface ArtistField {
    name: string;
    selectedId: number | null;
    autocomplete: ReturnType<typeof useAutocomplete>;
}

interface AlbumField {
    title: string;
    selectedId: number | null;
    autocomplete: ReturnType<typeof useAutocomplete>;
}

interface GenreField {
    name: string;
    selectedId: number | null;
    autocomplete: ReturnType<typeof useAutocomplete>;
}


interface UploadedDependencies<T extends string> {
    activeTab: Ref<T>;
}


export function useUploaded<T extends string>({
    activeTab,
}: UploadedDependencies<T>) {


    const uploadedTracks = ref<Track[]>([]);
    const uploadsLoading = ref(false);
    const uploadsError = ref('');

    let uploadsRequestId = 0;

    // ============================================
    // СОСТОЯНИЕ ФОРМЫ
    // ============================================

    const uploading = ref(false);
    const uploadSuccess = ref(false);
    const uploadError = ref('');

    const uploadForm = reactive({
        title: '',
        description: '',
    });

    const selectedFile = ref<File | null>(null);
    const fileInput = ref<HTMLInputElement | null>(null);

    const fieldErrors = reactive<Record<string, string>>({});

    // ============================================
    // ПОИСКОВЫЕ ПОДСКАЗКИ
    // ============================================

    async function fetchArtistOptions(
        search: string,
    ): Promise<AutocompleteOption[]> {
        const artists = await searchArtists(search);

        return artists.map(artist => ({
            id: artist.id,
            label: artist.name,
        }));
    }

    async function fetchAlbumOptions(
        search: string,
    ): Promise<AutocompleteOption[]> {
        const albums = await searchAlbums(search);

        return albums.map(album => ({
            id: album.id,
            label: album.title,
        }));
    }

    async function fetchGenreOptions(
        search: string,
    ): Promise<AutocompleteOption[]> {
        const genres = await searchGenres(search);

        return genres.map(genre => ({
            id: genre.id,
            label: genre.name,
        }));
    }

    function createArtistField(): ArtistField {
        return {
            name: '',
            selectedId: null,
            autocomplete: useAutocomplete(fetchArtistOptions),
        };
    }

    function createAlbumField(): AlbumField {
        return {
            title: '',
            selectedId: null,
            autocomplete: useAutocomplete(fetchAlbumOptions),
        };
    }

    function createGenreField(): GenreField {
        return {
            name: '',
            selectedId: null,
            autocomplete: useAutocomplete(fetchGenreOptions),
        };
    }

    const artistFields = reactive<ArtistField[]>([
        createArtistField(),
    ]);

    const albumField = reactive(createAlbumField());
    const genreField = reactive(createGenreField());

    function addArtistField(): void {
        if (uploading.value) {
            return;
        }

        artistFields.push(createArtistField());
    }

    function removeArtistField(index: number): void {
        if (uploading.value || artistFields.length <= 1) {
            return;
        }

        artistFields[index]?.autocomplete.close();
        artistFields.splice(index, 1);

        delete fieldErrors.artist_name;
    }

    function handleArtistInput(field: ArtistField): void {
        field.selectedId = null;

        delete fieldErrors.artist_name;

        field.autocomplete.search(field.name);
    }

    function selectArtist(
        field: ArtistField,
        option: AutocompleteOption,
    ): void {
        field.name = option.label;
        field.selectedId = option.id;

        delete fieldErrors.artist_name;

        field.autocomplete.close();
    }

    function handleAlbumInput(): void {
        albumField.selectedId = null;

        delete fieldErrors.album_title;

        albumField.autocomplete.search(albumField.title);
    }

    function selectAlbum(option: AutocompleteOption): void {
        albumField.title = option.label;
        albumField.selectedId = option.id;

        delete fieldErrors.album_title;

        albumField.autocomplete.close();
    }

    function handleGenreInput(): void {
        genreField.selectedId = null;

        delete fieldErrors.genre_name;

        genreField.autocomplete.search(genreField.name);
    }

    function selectGenre(option: AutocompleteOption): void {
        genreField.name = option.label;
        genreField.selectedId = option.id;

        delete fieldErrors.genre_name;

        genreField.autocomplete.close();
    }

    // ============================================
    // ЗАГРУЗКА СПИСКА ТРЕКОВ
    // ============================================

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
                responseData !== null &&
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
                '[Uploaded] Ошибка загрузки собственных треков:',
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
                    const message = err.response.data?.message;

                    uploadsError.value =
                        typeof message === 'string'
                            ? message
                            : 'Не удалось загрузить список треков.';
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
    // ФАЙЛ И ВАЛИДАЦИЯ
    // ============================================

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
        activeTab.value = 'upload' as T;

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

    // ============================================
    // СБРОС ФОРМЫ
    // ============================================

    function resetAutocompleteFields(): void {
        for (const field of artistFields) {
            field.autocomplete.close();
        }

        artistFields.splice(
            0,
            artistFields.length,
            createArtistField(),
        );

        albumField.autocomplete.close();
        albumField.title = '';
        albumField.selectedId = null;

        genreField.autocomplete.close();
        genreField.name = '';
        genreField.selectedId = null;
    }

    function resetUploadForm(): void {
        if (uploading.value) {
            return;
        }

        uploadForm.title = '';
        uploadForm.description = '';

        resetAutocompleteFields();

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
        uploadForm.description = '';

        resetAutocompleteFields();

        selectedFile.value = null;

        clearFieldErrors();

        if (fileInput.value) {
            fileInput.value.value = '';
        }
    }

    // ============================================
    // ОТПРАВКА ТРЕКА НА СЕРВЕР
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

        const artistIds: number[] = [];
        const artistNames: string[] = [];
        const seenArtistNames = new Set<string>();

        for (const field of artistFields) {
            const name = field.name.trim();

            if (!name) {
                continue;
            }

            if (field.selectedId !== null) {
                if (!artistIds.includes(field.selectedId)) {
                    artistIds.push(field.selectedId);
                }

                continue;
            }

            const key = name.toLowerCase();

            if (seenArtistNames.has(key)) {
                continue;
            }

            seenArtistNames.add(key);
            artistNames.push(name);
        }

        if (
            artistIds.length === 0 &&
            artistNames.length === 0
        ) {
            fieldErrors.artist_name = 'Укажи исполнителя.';
        }

        const albumTitle = albumField.title.trim();
        const genreName = genreField.name.trim();

        if (genreField.selectedId === null && !genreName) {
            fieldErrors.genre_name = 'Укажи жанр.';
        }

        if (!selectedFile.value) {
            fieldErrors.audio = 'Выбери аудиофайл.';
        } else if (selectedFile.value.size === 0) {
            fieldErrors.audio = 'Выбранный аудиофайл пуст.';
        } else if (selectedFile.value.size > MAX_FILE_SIZE) {
            fieldErrors.audio =
                'Размер файла превышает 100 МБ. Выбери файл меньшего размера.';
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
                artist_ids: artistIds.length
                    ? artistIds
                    : undefined,
                artist_names: artistNames.length
                    ? artistNames
                    : undefined,
                album_id: albumField.selectedId ?? undefined,
                album_title:
                    albumField.selectedId === null && albumTitle
                        ? albumTitle
                        : undefined,
                genre_id: genreField.selectedId ?? undefined,
                genre_name:
                    genreField.selectedId === null && genreName
                        ? genreName
                        : undefined,
                description:
                    uploadForm.description.trim() || undefined,
                audio: audioFile,
            });

            console.log(
                '[Uploaded] Трек успешно загружен:',
                response.data,
            );

            uploadSuccess.value = true;

            resetFormAfterUpload();

            activeTab.value = 'upload' as T;

            // Обновляем список после успешной загрузки.
            await loadUploadedTracks();
        } catch (err: unknown) {
            console.error(
                '[Uploaded] Ошибка загрузки трека:',
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
    // ПУБЛИЧНЫЙ API COMPOSABLE
    // ============================================

    return {
        // Список загрузок
        uploadedTracks,
        uploadsLoading,
        uploadsError,
        loadUploadedTracks,

        // Состояние формы
        uploading,
        uploadSuccess,
        uploadError,
        uploadForm,
        selectedFile,
        fileInput,
        fieldErrors,

        // Подсказки
        artistFields,
        albumField,
        genreField,
        addArtistField,
        removeArtistField,
        handleArtistInput,
        selectArtist,
        handleAlbumInput,
        selectAlbum,
        handleGenreInput,
        selectGenre,

        // Файл и форма
        openUpload,
        handleFileChange,
        formatFileSize,
        clearFieldErrors,
        resetUploadForm,
        uploadTrack,

        // Иконки, если они используются в шаблоне
        alertCircleOutline,
        checkmarkCircleOutline,
        chevronForwardOutline,
        cloudUploadOutline,
        discOutline,
        informationCircleOutline,
        musicalNotesOutline,
        pauseOutline,
        peopleOutline,
        playOutline,
        refreshOutline,
    };
}
