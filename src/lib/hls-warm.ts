import { resolveUrl } from '@/lib/endpoints';

/**
 * Прогрев «стартового набора» HLS для следующих треков (режим клипов):
 * манифест → init-сегмент → первые медиасегменты выбранной ступени и
 * аудиодорожки. Байты идут в дисковый кеш микросервиса (X-Cache: hit на
 * повторах) и в браузерный кеш (сегменты отдаются с max-age=3600) — скип
 * стартует почти мгновенно. Грузим строго последовательно (один запрос за
 * раз): лимит параллельных скачек микросервиса общий с живым
 * воспроизведением, отъедать его нельзя. Только по нетарифицируемой сети
 * (Wi-Fi): десятки мегабайт на LTE — не наша забота.
 */

/** Сколько первых медиасегментов греем на каждую дорожку. */
const WARM_SEGMENTS = 2;

export interface HlsVariant {
  height: number | null;
  bandwidth: number;
  uri: string;
}

export interface HlsMaster {
  variants: HlsVariant[];
  /** Дефолтная (или первая) аудиодорожка EXT-X-MEDIA; null — звук в видео. */
  audioUri: string | null;
}

function attr(line: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`).exec(line) ?? new RegExp(`${name}=([^,]+)`).exec(line);
  return match ? match[1] : null;
}

/** Мастер-манифест: видео-ступени (RESOLUTION/BANDWIDTH + URI строкой ниже) и аудиодорожки. */
export function parseMasterPlaylist(text: string): HlsMaster {
  const variants: HlsVariant[] = [];
  const audio: { uri: string; isDefault: boolean }[] = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith('#EXT-X-MEDIA:') && attr(line, 'TYPE') === 'AUDIO') {
      const uri = attr(line, 'URI');
      if (uri) audio.push({ uri, isDefault: attr(line, 'DEFAULT') === 'YES' });
      continue;
    }
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    const resolution = attr(line, 'RESOLUTION');
    const heightMatch = resolution ? /x(\d+)/.exec(resolution) : null;
    const bandwidth = Number(attr(line, 'BANDWIDTH') ?? 0);
    // URI варианта — следующая непустая строка (комментарии пропускаем).
    for (let next = index + 1; next < lines.length; next += 1) {
      const uri = lines[next].trim();
      if (!uri) continue;
      if (!uri.startsWith('#')) {
        variants.push({ height: heightMatch ? Number(heightMatch[1]) : null, bandwidth, uri });
        index = next;
      }
      break;
    }
  }
  const defaultAudio = audio.find((track) => track.isDefault) ?? audio[0];
  return { variants, audioUri: defaultAudio?.uri ?? null };
}

export interface HlsMediaStart {
  initUri: string | null;
  segmentUris: string[];
}

/** Начало медиаплейлиста: init-сегмент (EXT-X-MAP) и первые N сегментов. */
export function parseMediaPlaylistStart(text: string, maxSegments: number): HlsMediaStart {
  let initUri: string | null = null;
  const segmentUris: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXT-X-MAP:')) {
      initUri = attr(line, 'URI');
      continue;
    }
    if (line.startsWith('#')) continue;
    segmentUris.push(line);
    if (segmentUris.length >= maxSegments) break;
  }
  return { initUri, segmentUris };
}

/**
 * Ступень под выбор пользователя: высшая не выше желаемой (как
 * pickLevelIndex в hls-engine), выше ничего нет — нижняя; без высот
 * (нестандартный манифест) — по битрейту наоборот от желаемого не считаем,
 * берём максимальную.
 */
export function pickVariant(variants: HlsVariant[], pickHeight: number): HlsVariant | null {
  const withHeight = variants.filter((variant) => variant.height != null);
  if (!withHeight.length) {
    return variants.reduce<HlsVariant | null>(
      (best, variant) => (variant.bandwidth > (best?.bandwidth ?? -1) ? variant : best),
      null,
    );
  }
  const sorted = [...withHeight].sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
  let picked = sorted[0];
  for (const variant of sorted) {
    if ((variant.height ?? 0) <= pickHeight) picked = variant;
  }
  return picked;
}

/** Network Information API (Chromium/WebView): нет API — сеть считаем обычной. */
export function isUnmeteredConnection(): boolean {
  if (typeof navigator === 'undefined') return true;
  const connection = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return connection.type !== 'cellular';
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Тело вычитываем целиком: недочитанный ответ в браузерный кеш не ложится. */
async function fetchBytes(url: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (response.ok) await response.arrayBuffer();
  } catch {
    /* прогрев молчит */
  }
}

/**
 * Прогреть стартовый набор манифеста: ступень под pickHeight + аудиодорожка.
 * Ошибки глотаем: это фоновый прогрев, воспроизведение не ждёт его.
 */
export async function warmHlsStart(manifestUrl: string, pickHeight: number): Promise<void> {
  const masterUrl = resolveUrl(manifestUrl);
  const masterText = await fetchText(masterUrl);
  if (!masterText) return;
  const master = parseMasterPlaylist(masterText);
  const playlists: string[] = [];
  const variant = pickVariant(master.variants, pickHeight);
  if (variant) playlists.push(new URL(variant.uri, masterUrl).toString());
  if (master.audioUri) playlists.push(new URL(master.audioUri, masterUrl).toString());
  for (const playlistUrl of playlists) {
    const mediaText = await fetchText(playlistUrl);
    if (!mediaText) continue;
    const start = parseMediaPlaylistStart(mediaText, WARM_SEGMENTS);
    const uris = [start.initUri, ...start.segmentUris].filter((uri): uri is string => uri != null);
    for (const uri of uris) {
      await fetchBytes(new URL(uri, playlistUrl).toString());
    }
  }
}
