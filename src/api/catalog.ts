import { http } from '@/api/http';

// ============================================
// ТИПЫ
// ============================================

export interface CatalogArtist {
    id: number;
    name: string;
}

export interface CatalogAlbum {
    id: number;
    title: string;
    artist_id?: number | null;
}

export interface CatalogGenre {
    id: number;
    name: string;
}

// ============================================
// СПРАВОЧНИКИ ДЛЯ ПОДСКАЗОК В ФОРМЕ ЗАГРУЗКИ
// ============================================

/**
 * Подсказки исполнителей.
 *
 * GET /artists?search=
 */
export async function searchArtists(
    search: string,
): Promise<CatalogArtist[]> {
    const response = await http.get<CatalogArtist[]>(
        '/artists',
        {
            params: search ? { search } : {},
        },
    );

    return response.data;
}

/**
 * Подсказки альбомов.
 *
 * GET /albums?search=
 */
export async function searchAlbums(
    search: string,
): Promise<CatalogAlbum[]> {
    const response = await http.get<CatalogAlbum[]>(
        '/albums',
        {
            params: search ? { search } : {},
        },
    );

    return response.data;
}

/**
 * Подсказки жанров.
 *
 * GET /genres?search=
 */
export async function searchGenres(
    search: string,
): Promise<CatalogGenre[]> {
    const response = await http.get<CatalogGenre[]>(
        '/genres',
        {
            params: search ? { search } : {},
        },
    );

    return response.data;
}
