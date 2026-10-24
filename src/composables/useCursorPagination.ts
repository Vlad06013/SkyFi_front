import { ref, computed } from 'vue';

interface CursorPaginationResponse<T> {
    data: T[];
    next_page_url: string | null;
    prev_page_url: string | null;
    per_page: number;
}

interface PaginationOptions<T> {
    fetchPage: (
        url?: string | null,
    ) => Promise<CursorPaginationResponse<T>>;
    getKey?: (item: T) => string | number;
}

export function useCursorPagination<T>(
    options: PaginationOptions<T>,
) {
    const items = ref<T[]>([]);
    const nextPageUrl = ref<string | null>(null);
    const prevPageUrl = ref<string | null>(null);

    const loading = ref(false);
    const loadingMore = ref(false);
    const error = ref<unknown>(null);

    const hasMore = computed(
        () => nextPageUrl.value !== null,
    );

    async function loadInitial(): Promise<void> {
        if (loading.value || loadingMore.value) return;

        loading.value = true;
        error.value = null;

        try {
            const response = await options.fetchPage();

            items.value = response.data;
            nextPageUrl.value = response.next_page_url;
            prevPageUrl.value = response.prev_page_url;

        } catch (err) {
            error.value = err;
        } finally {
            loading.value = false;
        }
    }

    async function loadMore(): Promise<void> {
        if (
            loading.value
            || loadingMore.value
            || !nextPageUrl.value
        ) {
            return;
        }

        loadingMore.value = true;
        error.value = null;

        try {
            const response = await options.fetchPage(
                nextPageUrl.value,
            );

            const existingKeys = new Set(
                options.getKey
                    ? items.value.map(options.getKey)
                    : [],
            );

            const newItems = options.getKey
                ? response.data.filter(item => {
                    const key = options.getKey!(item);

                    if (existingKeys.has(key)) return false;

                    existingKeys.add(key);
                    return true;
                })
                : response.data;

            items.value = [...items.value, ...newItems];
            nextPageUrl.value = response.next_page_url;
            prevPageUrl.value = response.prev_page_url;
        } catch (err) {
            error.value = err;
        } finally {
            loadingMore.value = false;
        }
    }

    function reset(): void {
        items.value = [];
        nextPageUrl.value = null;
        prevPageUrl.value = null;
        error.value = null;
        loading.value = false;
        loadingMore.value = false;
    }

    return {
        items,
        loading,
        loadingMore,
        error,
        hasMore,
        nextPageUrl,
        prevPageUrl,
        loadInitial,
        loadMore,
        reset,
    };
}
