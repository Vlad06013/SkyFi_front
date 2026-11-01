/**
 * Парсинг даты, которую отдал сервер.
 *
 * Бэкенд отдаёт naive-дату в UTC (Laravel timezone => UTC), а Date
 * без явной зоны воспринимает её как локальное время браузера —
 * ссылка выглядит на смещение пояса старше, чем есть, и TTL отсекает
 * даже свежую. Поэтому зону добавляем сами. Если сервер когда-нибудь
 * начнёт отдавать ISO-строку с зоной — она пройдёт как есть.
 */
export function parseServerDate(value: string): number {
    const normalized = value.trim().replace(' ', 'T');
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(normalized);

    return Date.parse(hasZone ? normalized : `${normalized}Z`);
}

/**
 * Ссылка на аудио ещё свежая?
 *
 * TTL живёт на бэке: константы источников (у Яндекса — 3600 сек)
 * хранятся там, а фронт получает готовое значение file.path_ttl_sec
 * вместе с каждым файлом (null — ссылка бессрочная, у загрузок).
 *
 * Проверяем без сети: если ссылка старше TTL — считаем её мёртвой
 * и сразу идём за свежей через /tracks/{id}/audio.
 *
 * Гарантии нет: ссылку могли получить за минуту до протухания,
 * а TTL при этом 3600. Такую ловит повторная попытка
 * воспроизведения: при ошибке ссылка выбрасывается и запрашивается
 * заново через /audio.
 *
 * Дата получения неизвестна (null) или не распарсилась — не отсекаем.
 */
export function isAudioUrlFresh(
    fetchedAt: string | number | null | undefined,
    ttlSec: number | null | undefined,
): boolean {
    if (ttlSec === null || ttlSec === undefined || ttlSec <= 0) {
        return true;
    }

    if (fetchedAt === null || fetchedAt === undefined) {
        return true;
    }

    const fetched =
        typeof fetchedAt === 'number'
            ? fetchedAt
            : parseServerDate(fetchedAt);

    if (!Number.isFinite(fetched)) {
        return true;
    }

    return Date.now() - fetched < ttlSec * 1000;
}
