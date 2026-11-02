/**
 * Источник воспроизведения (список, из которого запущен трек).
 *
 * Глобальный список для всего фронтенда.
 * Зеркало бэкенд-enum
 * App\Domain\Services\Additional\Enums\Player\PlaySourceListsEnum —
 * значения уходят в API как playback_source, не переименовывать.
 */
export enum PlaySourceListsEnum {
    SINGLE = 'single',
    QUEUE = 'queue',
    FAVORITES = 'favorites',
    SEARCH = 'search',
    PLAYLIST = 'playlist',
    UPLOAD = 'uploads',
    YANDEX_WAVE = 'yandex_wave',
}
