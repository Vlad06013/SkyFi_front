import { reactive } from 'vue';

// ============================================
// ТИПЫ
// ============================================

export interface AutocompleteOption {
    id: number;
    label: string;
}

type AutocompleteFetcher = (
    search: string,
) => Promise<AutocompleteOption[]>;

interface AutocompleteState {
    options: AutocompleteOption[];
    isOpen: boolean;
    isLoading: boolean;
}

// ============================================
// ПОДСКАЗКИ ПОЛЕЙ ФОРМЫ
// ============================================

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Поисковые подсказки для поля ввода.
 *
 * fetcher — функция, запрашивающая варианты по строке поиска
 * (например, searchArtists из @/api/catalog).
 *
 * search() вызываем при вводе текста (с дебаунсом),
 * open() — при фокусе на поле (запрос сразу),
 * close() — при потере фокуса.
 */
export function useAutocomplete(fetcher: AutocompleteFetcher) {
    const state = reactive<AutocompleteState>({
        options: [],
        isOpen: false,
        isLoading: false,
    });

    let requestId = 0;
    let debounceTimer: ReturnType<typeof setTimeout> | null =
        null;

    function clearDebounce(): void {
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
    }

    async function run(search: string): Promise<void> {
        const currentRequestId = ++requestId;

        state.isLoading = true;

        try {
            const options = await fetcher(search);

            if (currentRequestId !== requestId) {
                return;
            }

            state.options = options;
            state.isOpen = true;
        } catch (error) {
            if (currentRequestId !== requestId) {
                return;
            }

            console.error(
                '[Autocomplete] Не удалось загрузить подсказки:',
                error,
            );

            state.options = [];
            state.isOpen = false;
        } finally {
            if (currentRequestId === requestId) {
                state.isLoading = false;
            }
        }
    }

    /**
     * Поиск с дебаунсом — для обработчика ввода текста.
     */
    function search(query: string): void {
        clearDebounce();

        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void run(query.trim());
        }, SEARCH_DEBOUNCE_MS);
    }

    /**
     * Немедленный поиск — для обработчика фокуса на поле.
     */
    function open(query: string): void {
        clearDebounce();
        void run(query.trim());
    }

    function close(): void {
        state.isOpen = false;
    }

    return {
        state,
        search,
        open,
        close,
    };
}
