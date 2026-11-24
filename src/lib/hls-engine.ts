import type Hls from 'hls.js';
import type { ErrorData, Level, MediaPlaylist } from 'hls.js';

/**
 * HLS-движок (api.md §8.1): обёртка над hls.js — отложенный импорт
 * библиотеки, жизненный цикл плеера, аудиодорожки (дубляжи из EXT-X-MEDIA
 * манифеста) и качество (ABR с потолком или фиксированный уровень).
 * Оркестрацией владеет useVideoPlayback: ретраи, фолбэк на прогрессив,
 * позиция — снаружи.
 */

/** Аудиодорожка клипа для UI: маппинг EXT-X-MEDIA манифеста (hls.audioTracks). */
export interface ClipAudioTrack {
  /** id дорожки hls.js строкой — ключ выбора (lang у YouTube-манифестов нет). */
  id: string;
  label: string;
  lang: string;
  default: boolean;
}

export interface HlsEngineHooks {
  /** Фатальная ошибка манифеста/сегментов: снаружи один ретрай get-url, потом фолбэк. */
  onError: () => void;
  /** Высоты видео из разобранного манифеста — пункты селекта качества. */
  onHeights: (heights: number[]) => void;
  /** Дорожки из манифеста (дедуплицированные) — пункты селекта озвучки. */
  onAudioTracks: (tracks: ClipAudioTrack[]) => void;
}

const noopHooks: HlsEngineHooks = {
  onError: () => undefined,
  onHeights: () => undefined,
  onAudioTracks: () => undefined,
};

let hls: Hls | null = null;
/** Промис создания инстанса: без него параллельные hlsLoad (applyHls зовётся
 *  и из loadVideo, и из вотчера clipStreams) до резолва import создавали два
 *  инстанса — второй перезаписывал singleton, не будучи аттачнутым, и вся
 *  настройка (качество/дорожки) уходила в пустышку с пустым levels. */
let hlsPromise: Promise<Hls> | null = null;
let hooks = noopHooks;
let attachedEl: HTMLVideoElement | null = null;
let activeManifest: string | null = null;
/** Желаемая дорожка (id): применяем на старте и после каждой смены манифеста. */
let desiredAudioId: string | null = null;
/** null — ABR (потолок capHeight); иначе фиксированная высота. */
let fixedHeight: number | null = null;
let capHeight = 720;
/**
 * Комбинация качества, уже применённая к живой сессии. Повторное применение
 * того же значения пропускаем: currentLevel дёргает flush+перезагрузку буфера,
 * и фоновые reapply (TTL, ретрай get-url) иначе роняли бы воспроизведение,
 * а в auto — сбрасывали бы подъём ABR на низкое качество.
 */
let appliedQualityKey: string | null = null;

export function setHlsHooks(value: HlsEngineHooks): void {
  hooks = value;
}

/** MSE есть не везде (старые WebView): снаружи по false уходит на прогрессив. */
export async function hlsSupported(): Promise<boolean> {
  const { default: HlsCtor } = await import('hls.js');
  return HlsCtor.isSupported();
}

async function ensureHls(): Promise<Hls> {
  if (hls) return hls;
  if (!hlsPromise) {
    hlsPromise = createHls();
    // Сбой создания (import/инициализация) не кешируем — следующий вызов повторит.
    hlsPromise.catch(() => {
      hlsPromise = null;
    });
  }
  return hlsPromise;
}

async function createHls(): Promise<Hls> {
  const { default: HlsCtor } = await import('hls.js');
  const created = new HlsCtor({
    // Цель форвард-буфера у hls.js — max(8 * maxBufferSize / битрейт, maxBufferLength),
    // ограниченная maxMaxBufferLength: с дефолтными 60 МБ для низкобитрейтных
    // ступеней YouTube это 600 с — клип скачивался целиком одним залпом.
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
  });
  created.on(HlsCtor.Events.ERROR, (_event, data: ErrorData) => {
    // Нефатальные hls.js переживает сам (свои ретраи сегментов/плейлистов).
    if (data.fatal) hooks.onError();
  });
  created.on(HlsCtor.Events.MANIFEST_PARSED, () => {
    hooks.onHeights(created.levels.map((level) => level.height));
    applyQuality(created);
  });
  created.on(HlsCtor.Events.AUDIO_TRACKS_UPDATED, () => {
    hooks.onAudioTracks(mapAudioTracks(created.audioTracks));
    applyAudioTrack(created);
  });
  hls = created;
  // DEV-диагностика: доступ к инстансу из консоли (window.__hls).
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as { __hls: Hls }).__hls = created;
  }
  return created;
}

/**
 * Поставить манифест в элемент. Результат: был ли аттач/смена источника —
 * снаружи по этому флагу фиксируют позицию для resume (loadedmetadata
 * придёт после и отыграет её).
 */
export async function hlsLoad(el: HTMLVideoElement, manifestUrl: string): Promise<boolean> {
  const instance = await ensureHls();
  if (attachedEl === el && activeManifest === manifestUrl) return false;
  if (attachedEl !== el) {
    instance.attachMedia(el);
    attachedEl = el;
  }
  instance.loadSource(manifestUrl);
  activeManifest = manifestUrl;
  // Новый манифест — качество применяем заново на MANIFEST_PARSED.
  appliedQualityKey = null;
  return true;
}

/** Отключить HLS-сессию: элемент освобождается под обычный src (прогрессив/стоп). */
export function hlsDetach(): void {
  const el = attachedEl;
  if (hls && el) {
    hls.detachMedia();
    el.removeAttribute('src');
    el.load();
  }
  attachedEl = null;
  activeManifest = null;
  appliedQualityKey = null;
}

/** Фатальная сетевая ошибка останавливает загрузку hls.js — будим после ретрая get-url. */
export function hlsResume(): void {
  if (hls && attachedEl) hls.startLoad();
}

/** Желание дорожки (id из ClipAudioTrack): запоминаем и применяем к живой сессии. */
export function hlsSetAudioTrack(id: string | null): void {
  desiredAudioId = id;
  if (hls && attachedEl) applyAudioTrack(hls);
}

function applyAudioTrack(instance: Hls): void {
  const resolved = resolveAudioTrackId(mapAudioTracks(instance.audioTracks), desiredAudioId);
  if (resolved != null && String(instance.audioTrack) !== resolved) {
    instance.audioTrack = Number(resolved);
  }
}

/** Качество: auto — ABR с потолком height; иначе фиксированный уровень. */
export function hlsSetQuality(options: { auto: boolean; height: number }): void {
  capHeight = options.height;
  fixedHeight = options.auto ? null : options.height;
  if (import.meta.env.DEV) console.log('[hls] setQuality', JSON.stringify(options), 'attached=', !!attachedEl);
  if (hls && attachedEl) applyQuality(hls);
}

function applyQuality(instance: Hls): void {
  const levels = instance.levels;
  if (!levels.length) {
    // Манифест ещё не разобран — применится на MANIFEST_PARSED.
    if (import.meta.env.DEV) console.log('[hls] applyQuality SKIP: уровней нет');
    return;
  }
  const key = fixedHeight == null ? `auto:${capHeight}` : `fixed:${fixedHeight}`;
  if (key === appliedQualityKey) {
    if (import.meta.env.DEV) console.log('[hls] applyQuality SKIP', key);
    return;
  }
  const wasAuto = appliedQualityKey != null && appliedQualityKey.startsWith('auto:');
  appliedQualityKey = key;
  if (fixedHeight == null) {
    // Уже в auto — меняем только потолок, без сброса буфера (ABR подстроится сам).
    if (!wasAuto) instance.currentLevel = -1;
    // autoLevelCapping — индекс в hls.levels (они отсортированы по высоте).
    instance.autoLevelCapping = pickLevelIndex(levels, capHeight);
    if (import.meta.env.DEV) {
      console.log('[hls] applyQuality', key, '-> capping', instance.autoLevelCapping,
        'height', levels[instance.autoLevelCapping]?.height);
    }
  } else {
    const picked = pickLevelIndex(levels, fixedHeight);
    instance.autoLevelCapping = -1;
    instance.currentLevel = picked;
    // NB: геттер currentLevel возвращает уровень играющего фрагмента (лагает) —
    // логируем установленный индекс, а не геттер.
    if (import.meta.env.DEV) {
      console.log('[hls] applyQuality', key, '-> set currentLevel', picked, 'height', levels[picked]?.height);
    }
  }
}

/**
 * YouTube кладёт в манифест одинаковые дорожки («Default» под разными
 * группами битрейтов) — в UI это один пункт, дедупликация по lang+label.
 */
export function mapAudioTracks(
  tracks: Array<Pick<MediaPlaylist, 'id' | 'name' | 'lang' | 'default'>>,
): ClipAudioTrack[] {
  const seen = new Set<string>();
  const mapped: ClipAudioTrack[] = [];
  for (const track of tracks) {
    const lang = track.lang ?? '';
    const label = track.name || lang || `Дорожка ${track.id + 1}`;
    const key = `${lang}|${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mapped.push({ id: String(track.id), label, lang, default: track.default });
  }
  return mapped;
}

/** Выбор дорожки: желаемая, если жива; иначе default из манифеста; null — выбор hls.js. */
export function resolveAudioTrackId(tracks: ClipAudioTrack[], desired: string | null): string | null {
  if (desired && tracks.some((track) => track.id === desired)) return desired;
  return tracks.find((track) => track.default)?.id ?? null;
}

/** Индекс уровня не выше height (hls.levels отсортированы по высоте); выше ничего нет — нижний. */
export function pickLevelIndex(levels: Array<Pick<Level, 'height'>>, height: number): number {
  let picked = 0;
  for (let index = 0; index < levels.length; index += 1) {
    if (levels[index].height <= height) picked = index;
  }
  return picked;
}