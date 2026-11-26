import { ref, watch } from 'vue';
import { fetchVideoStreams, resolveVideo } from '@/api/videos';
import type { VideoHls } from '@/api/videos';
import { ApiError } from '@/api/http';
import { resolveUrl } from '@/lib/endpoints';
import { hlsDetach, hlsLoad, hlsResume, hlsSetAudioTrack, hlsSetQuality, hlsSupported, setHlsHooks } from '@/lib/hls-engine';
import { noteExternalTransport, runOwned, runOwnedAsync } from '@/lib/media-keys';
import { afterMediaUnlock, isAutoplayBlocked, markAutoplayBlocked } from '@/lib/media-unlock';
import { snapshotKey } from '@/lib/playback-engine';
import { cacheVideoStreams, getCachedStream, invalidateStream } from '@/lib/stream-url-cache';
import { useOnlineStore } from '@/stores/online';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import { useYoutubeStore } from '@/stores/youtube';
import type { TrackSnapshot, VideoSnapshot } from '@/types';

/**
 * Видео-движок (клипы, api.md §8, §8.1): видео-снапшоты играют напрямую через
 * `/videos/get-url`; для трека с включённым режимом клипов бэк матчит
 * «трек → видео» через `/videos/resolve` (video: null — клипа нет, остаёмся
 * на аудио, индикатор в плеере). Ответ get-url несёт прогрессив streams и
 * HLS-манифест: hls не null — играем манифест через hls.js (качество ABR,
 * дорожки/дубляжи из манифеста), иначе прогрессив src. Ошибка потока —
 * один ретрай get-url, повторная — фолбэк HLS → прогрессив → аудио трека.
 * Картинка крепится в хост развёрнутого плеера; сворачивание перекладывает
 * её в мини-плеер — воспроизведение не прерывается (нет хоста — элемент
 * остаётся без родителя и поёт дальше, из DOM его не выкидываем).
 * Тап по видео — пауза/плей, двойной тап — полный экран.
 * Клип резолвит и показывает КАЖДОЕ устройство (пульт — в mute, звук только
 * с активного, иначе двойной звук): режим клипов — серверный флаг, а картинка
 * локальная подмена потока на каждом экране. Переходы (ended) двигает только
 * активное; пульт подгоняет позицию к зеркалу сервера.
 */

let video: HTMLVideoElement | null = null;
let bound = false;
/** Ключ видео, для которого уже подняты потоки — сравнение по snapshotKey. */
let loadedKey: string | null = null;
/** Ключ видео, чьи потоки реально стоят в элементе (loadedKey — бронь до ответа). */
let appliedKey: string | null = null;
/** HLS-сессия держит MSE-источник элемента — перед прогрессивом/стопом отключаем. */
let hlsAttached = false;
/** Манифест, реально стоящий в элементе: смена — фиксируем позицию для resume. */
let appliedManifest: string | null = null;
/** Ретраи ошибок потока: один get-url на режим (api.md §8.1), потом фолбэк. */
let streamRetryKey: string | null = null;
let streamRetries = 0;
/** Видео, для которых HLS уже сдался: доигрываем прогрессивом, манифест не переподнимаем. */
let progressiveOnlyKey: string | null = null;
/** Видео, по которым подсказка «обновите cookies» уже показана — не спамим на каждый get-url. */
const cookiesHintShown = new Set<string>();
/** Летящий запрос потоков: следующий его отменяет — при быстром скипе уходит только последний. */
let loadAbort: AbortController | null = null;
/** Летящий резолв: тогл выкл/смена трека отменяют — ответ уже никому не нужен. */
let resolveAbort: AbortController | null = null;
/** Таймер продления TTL: перед протуханием ссылок перезапрашиваем потоки. */
let ttlTimer: ReturnType<typeof setTimeout> | null = null;
/** Позиция для восстановления после смены качества/продления: src пересоздаёт поток. */
let resumeAt: number | null = null;
/**
 * Куда должен встать новый источник. timeupdate прошлого currentTime
 * (элемент ещё на старой секунде) в якорь не берём, пока не окажемся рядом.
 */
let resumeTarget: number | null = null;

/** Хост в развёрнутом плеере: сюда крепится видео-элемент (null — свёрнут/не клип). */
const clipHost = ref<HTMLElement | null>(null);
/** Хост в мини-плеере: сворачивание перекладывает видео сюда — клип поёт дальше. */
const miniClipHost = ref<HTMLElement | null>(null);
/** Хост на диске главной: мини-плеер там не смонтирован. */
const homeClipHost = ref<HTMLElement | null>(null);
/** Куда прячем элемент, пока видимого хоста нет: вынутый из документа video браузер ставит на паузу. */
let playbackPark: HTMLElement | null = null;
/** Элемент клипа ждёт данные при включённом воспроизведении — спиннер поверх видео. */
export const clipBuffering = ref(false);
/**
 * Первый кадр уже показан. До этого видео скрыто: чёрный кадр MSE не должен
 * закрывать обложку. Обложка стоит, пока не придёт реальный кадр.
 */
export const clipFrameReady = ref(false);
/** Где сейчас висит единственный <video>. Обложку снимаем только там. */
export type ClipSurface = 'expanded' | 'home' | 'mini';
export const clipSurface = ref<ClipSurface | null>(null);
/** Смена потока отменяет опоздавший колбэк кадра предыдущего ролика. */
let frameToken = 0;
/**
 * Поколение открытия ролика. Пока новый источник не встал в элемент,
 * playing/pause старого кадра не должны вернуть чёрный кадр и снять спиннер.
 */
let openGen = 0;
let armedGen = 0;
/** Поколение резолва: опоздавший ответ не гасит спиннер нового клика. */
let resolveGen = 0;

/** Новое видео: обложка сразу, спиннер на ней, прошлый кадр спрятан. */
function beginOpening() {
  openGen += 1;
  armedGen = 0;
  setClipFrameReady(false);
  if (usePlayerStore().state.is_playing) clipBuffering.value = true;
}

/** Источник этого ролика уже в элементе — следующий playing можно показывать. */
function armOpening() {
  armedGen = openGen;
  const el = video;
  if (el) revealPausedFrame(el);
}

/**
 * Пауза после обновления страницы: playing не приходит, буфер уже есть,
 * но обложка поиска остаётся вместо кадра на сохранённой позиции.
 * Пока currentTime не на цели — не показываем чужой кадр.
 */
/** Пока летит resolve, спиннер держим: события старого ролика его не снимают. */
function releaseBuffering() {
  if (usePlayerStore().clipStatus === 'resolving') return;
  clipBuffering.value = false;
}

function revealPausedFrame(el: HTMLVideoElement) {
  if (!openingArmed()) return;
  if (!usePlayerStore().clipActive) return;
  if (!el.paused && !el.ended) return;
  if (resumeAt != null) return;
  if (resumeTarget != null && Math.abs(el.currentTime - resumeTarget) > 1) return;
  if (el.readyState < 2) return;
  releaseBuffering();
  setClipFrameReady(true);
}

function openingArmed(): boolean {
  return armedGen !== 0 && armedGen === openGen;
}

function setClipFrameReady(ready: boolean) {
  if (!ready) frameToken += 1;
  clipFrameReady.value = ready;
  video?.classList.toggle('is-ready', ready);
}

/** Кадр на экране, не просто canplay: MSE часто отдаёт чёрный буфер раньше картинки.
 *  requestVideoFrameCallback не приходит, пока элемент с opacity:0, и превью так и висит. */
function armFirstFrame(el: HTMLVideoElement) {
  const token = ++frameToken;
  const mark = () => {
    if (token !== frameToken || el.videoWidth === 0) return;
    clipFrameReady.value = true;
    el.classList.add('is-ready');
  };
  if (typeof el.requestVideoFrameCallback === 'function') el.requestVideoFrameCallback(() => mark());
  const started = performance.now();
  const poll = () => {
    if (token !== frameToken || clipFrameReady.value) return;
    if (el.videoWidth > 0 && el.readyState >= 2) {
      mark();
      return;
    }
    if (performance.now() - started > 4_000) return;
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

/** Какая попытка play() ещё актуальна: опоздавший отказ не гасит новый прогрев. */
let playAttempt = 0;

/** Кадр стоит, пока элемент ждёт данные — ползунок не тикает вперёд. */
function holdProgressWhileBuffering(store: ReturnType<typeof usePlayerStore>, el: HTMLVideoElement) {
  if (!store.state.is_playing || !store.clipActive) return;
  const snap = store.clipPlaybackVideo;
  if (!snap || snapshotKey(snap) !== appliedKey) return;
  store.setPlaybackStalled(true, el.currentTime);
}

/**
 * Старт или повтор play(). Прогрев держим до события playing: canplay на
 * холодном HLS приходит задолго до картинки. Отказ автоплея после
 * перезагрузки прогревом не считается — спиннер не крутится вхолостую.
 */

function tryPlay(el: HTMLVideoElement) {
  const player = usePlayerStore();
  if (!player.state.is_playing || player.clipPlaybackVideo == null) return;
  if (!el.paused && !el.ended) return;
  if (isAutoplayBlocked()) return;
  const attempt = ++playAttempt;
  player.setStreamWarming(true);
  afterMediaUnlock(() => {
    const store = usePlayerStore();
    const stale = () => attempt !== playAttempt;
    if (stale()) return;
    if (!store.state.is_playing || store.clipPlaybackVideo == null || el.ended) {
      store.setStreamWarming(false);
      return;
    }
    if (!el.paused) return;
    void runOwnedAsync(() => el.play().catch((error: unknown) => {
      if (stale()) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof DOMException && error.name === 'NotAllowedError') markAutoplayBlocked();
      store.setStreamWarming(false);
      revealPausedFrame(el);
    }));
  });
}

setHlsHooks({
  onError: () => handleStreamError(),
  onHeights: (heights) => usePlayerStore().setClipHlsHeights(heights),
  onAudioTracks: (tracks) => usePlayerStore().setClipAudioTracks(tracks),
});

export function setClipHost(el: HTMLElement | null) {
  clipHost.value = el;
  if (el) syncAttachmentSoon();
}

export function setMiniClipHost(el: HTMLElement | null) {
  miniClipHost.value = el;
  if (el) syncAttachmentSoon();
}

export function setHomeClipHost(el: HTMLElement | null) {
  homeClipHost.value = el;
  if (el) syncAttachmentSoon();
}

/**
 * Пересинхронизация видимости хостов снаружи: keep-alive возвращает страницу
 * без смены ref'ов (элементы те же), вотчер молчит, и видео остаётся
 * в парковке — диск главной показывал застывшее превью при играющем звуке.
 */
export function resyncClipAttachment() {
  syncAttachment();
}

/** Хост только что встал в DOM: раскладка ещё не посчитана, getClientRects
 *  пуст — немедленный синк парковал элемент. Повторяем после кадра. */
function syncAttachmentSoon() {
  requestAnimationFrame(() => requestAnimationFrame(syncAttachment));
}

function parkEl(): HTMLElement {
  if (playbackPark?.isConnected) return playbackPark;
  playbackPark = document.createElement('div');
  playbackPark.setAttribute('aria-hidden', 'true');
  playbackPark.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
  document.body.appendChild(playbackPark);
  return playbackPark;
}

/** Видео-элемент клипа (singleton) — для чтения buffered в UI (шкала буфера). */
export function getClipVideoElement(): HTMLVideoElement | null {
  return video;
}

function ensureVideo(): HTMLVideoElement {
  if (!video) {
    video = document.createElement('video');
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.controls = false;
    video.disablePictureInPicture = true;
    video.preload = 'auto';
    video.className = 'clip-video';
    // Полноэкранный режим самого <video> — системный плеер. Наш экран
    // разворачивает оболочку плеера кнопкой, не элемент.
    video.addEventListener('webkitbeginfullscreen', () => {
      const el = video as (HTMLVideoElement & { webkitExitFullscreen?: () => void }) | null;
      el?.webkitExitFullscreen?.();
    });
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement === video) void document.exitFullscreen().catch(() => undefined);
    });
    // Звук — только с активного устройства; пультам видео идёт в mute
    // (иначе двойной звук; рассинхрона картинки с активным нет — позиция
    // общая с серверного стейта).
    video.muted = !usePlayerStore().isActiveDevice;
  }
  return video;
}

/**
 * Позиция, с которой надо открыть поток. Пока seek на элемент не встал,
 * currentTime ещё 0 — брать его нельзя, иначе get-url/HLS стартует клип
 * сначала и тут же прячет обложку кадром с нуля.
 */
function resumeSeconds(explicit?: number): number {
  if (explicit != null) return explicit;
  if (resumeAt != null) return resumeAt;
  const played = video && Number.isFinite(video.currentTime) ? video.currentTime : 0;
  if (resumeTarget != null && played === 0 && Math.abs(played - resumeTarget) > 1) return resumeTarget;
  if (played > 0) return played;
  if (resumeTarget != null) return resumeTarget;
  return usePlayerStore().state.position_seconds;
}

/** Потоки текущего эффективного видео обновились — переприменить с той же позицией. */
function reapplyStreams() {
  applyStream(resumeSeconds());
}

function applyStream(resumePosition?: number) {
  const el = ensureVideo();
  const player = usePlayerStore();
  const resume = resumeSeconds(resumePosition);
  // HLS сдался на этом видео (повторная ошибка) — доигрываем прогрессивом.
  const hls = progressiveOnlyKey === appliedKey ? null : player.clipHls;
  if (hls) {
    applyHls(el, hls, resume);
    syncAttachment();
    return;
  }
  // Позицию снимаем до detach: он пересоздаёт элемент и обнуляет currentTime.
  // Новый ролик передаёт серверную позицию: currentTime элемента — это ещё
  // прошлый ролик или ноль, пока seek не отыграл.
  if (hlsAttached) {
    hlsDetach();
    hlsAttached = false;
    appliedManifest = null;
  }
  const stream = activeStream(player.clipStreams, player.clipQuality);
  if (!stream) return;
  // Ссылки с бэка относительные (api.md §1.7) — хост подставляем в момент
  // подстановки: кеш в IndexedDB хранит их как пришли.
  const streamUrl = resolveUrl(stream.url);
  // Уже этот поток: всё равно кладём элемент в видимый хост. Иначе src
  // совпал, функция выходила раньше, и превью оставалось без видео под ним.
  if (el.src === streamUrl) {
    syncAttachment();
    if (!openingArmed()) armOpening();
    armFirstFrame(el);
    return;
  }
  // Свежий клип на треке стартует с серверной позиции трека; смена качества
  // и продление TTL — с текущей позиции элемента.
  resumeAt = resume;
  resumeTarget = resume;
  el.src = streamUrl;
  // Новый источник — обложка снова вместо кадра, пока playing не наступит.
  setClipFrameReady(false);
  armOpening();
  player.setStreamWarming(true);
  tryPlay(el);
  syncAttachment();
}

/** HLS-режим (api.md §8.1): манифест через hls.js, дорожка и качество — его API. */
function applyHls(el: HTMLVideoElement, hls: VideoHls, resumePosition?: number) {
  const player = usePlayerStore();
  hlsSetAudioTrack(player.clipAudioId);
  hlsSetQuality({ auto: player.clipHlsAuto, height: player.clipQuality });
  // Манифест с бэка относительный (api.md §1.7) — резолвим в момент подстановки;
  // сегменты внутри m3u8 плеер отрезолвит от origin'а манифеста сам.
  const manifestUrl = resolveUrl(hls.manifest_url);
  // Новый манифест или ещё не играем — ждём playing. Повтор того же
  // манифеста на живом кадре прогрев не трогает.
  const switching = appliedManifest !== manifestUrl;
  if (switching) setClipFrameReady(false);
  if (switching || el.paused) player.setStreamWarming(true);
  // Явная позиция (новый ролик — серверные секунды, часто 0) важнее currentTime:
  // на том же элементе там ещё хвост предыдущего видео.
  const resume =
    resumePosition != null
      ? resumePosition
      : Number.isFinite(el.currentTime) && el.currentTime > 0
        ? el.currentTime
        : 0;
  if (switching) {
    // Аттач/смена манифеста рестартуют поток: позицию ловит loadedmetadata (resumeAt).
    resumeAt = resume;
    resumeTarget = resume;
  }
  void (async () => {
    // MSE нет (старый WebView) — манифест не поднять, честный фолбэк на прогрессив.
    if (!(await hlsSupported())) {
      handleStreamError();
      return;
    }
    const attached = await hlsLoad(el, manifestUrl, switching ? resume : undefined);
    appliedManifest = manifestUrl;
    hlsAttached = true;
    // Манифест тот же (ретрай get-url после фатальной ошибки): источник не
    // пересоздаётся — будим остановленную hls.js загрузку.
    if (!attached) hlsResume();
    // События до этой точки — ещё прошлый ролик (чёрный кадр / его playing).
    armOpening();
    // playing часто успевает прийти, пока грузится hls.js, и второй раз не
    // повторяется. Без этого превью остаётся, хотя звук уже идёт.
    armFirstFrame(el);
    tryPlay(el);
  })().catch(() => handleStreamError());
}

/**
 * Ошибка потока/сегмента (api.md §8.1): один повторный get-url с подменой
 * источника; повторная — HLS сдаётся в пользу прогрессива, прогрессив —
 * честный фолбэк на аудио трека.
 */
function handleStreamError() {
  const store = usePlayerStore();
  // Попытка закончилась ошибкой: прогрев снят, ретрай/фолбэк выставит заново.
  store.setStreamWarming(false);
  if (store.current?.type === 'video') {
    // Чистое видео из выдачи: аудио-фолбэка нет — только глушим флаг звучания.
    store.setAudioPlaying(false);
    return;
  }
  if (!store.clipActive) return;
  const key = appliedKey;
  if (!key) return;
  if (streamRetryKey !== key) {
    streamRetryKey = key;
    streamRetries = 0;
  }
  if (streamRetries === 0) {
    streamRetries = 1;
    const current = store.clipPlaybackVideo;
    if (current) {
      invalidateStream(current);
      void refreshStreams(current);
    }
    return;
  }
  if (store.clipHls && progressiveOnlyKey !== key && store.clipStreams.length > 0) {
    progressiveOnlyKey = key;
    // У прогрессива свой один ретрай get-url.
    streamRetries = 0;
    reapplyStreams();
    return;
  }
  store.setClipUnavailable();
  useToastStore().show('Клип недоступен, продолжаем аудио', '', true);
}

/**
 * get-url 502 у пользователя с привязанными cookies — подсказка обновить
 * экспорт (api.md §8.1). Раз на видео, воспроизведение не прерываем.
 * Возвращает true, если показали подсказку (снаружи не дублируют общий тост).
 */
async function maybeHintCookies(error: unknown, key: string): Promise<boolean> {
  if (!(error instanceof ApiError) || error.status !== 502 || cookiesHintShown.has(key)) return false;
  const youtube = useYoutubeStore();
  if (youtube.hasCookies === null) {
    try {
      await youtube.refresh();
    } catch {
      return false;
    }
  }
  if (!youtube.hasCookies) {
    cookiesHintShown.add(key);
    return false;
  }
  cookiesHintShown.add(key);
  useToastStore().show('YouTube не отвечает', 'cookies могли устареть — обновите экспорт: Настройки → YouTube', true);
  return true;
}

function activeStream(streams: { quality: number; url: string }[], preferred: number) {
  return (
    streams.find((stream) => stream.quality === preferred) ??
    [...streams].sort((a, b) => b.quality - a.quality)[0]
  );
}

function placeOf(host: HTMLElement): ClipSurface {
  if (host === clipHost.value) return 'expanded';
  if (host === homeClipHost.value) return 'home';
  return 'mini';
}

/** keep-alive снимает главную с экрана, но хост остаётся. В невидимый
 *  элемент кадр не рисуется, а превью на видимом месте так и висит. */
function hostVisible(host: HTMLElement | null): host is HTMLElement {
  return host != null && host.isConnected && host.getClientRects().length > 0;
}

function visibleHost(): HTMLElement | null {
  if (hostVisible(clipHost.value)) return clipHost.value;
  if (hostVisible(homeClipHost.value)) return homeClipHost.value;
  if (hostVisible(miniClipHost.value)) return miniClipHost.value;
  return null;
}

function syncAttachment() {
  const el = ensureVideo();
  const player = usePlayerStore();
  const host = visibleHost();
  const playable =
    player.clipStreams.length > 0 || player.clipHls != null || (el.currentSrc !== '' && el.error == null);
  const show = host != null && player.clipPlaybackVideo != null && playable;
  if (show && host) {
    if (el.parentElement !== host) host.appendChild(el);
    clipSurface.value = placeOf(host);
    return;
  }
  const holder = parkEl();
  if (el.parentElement !== holder) holder.appendChild(el);
  clipSurface.value = null;
}

/** Перед протуханием ссылок (ttl_sec) догоняем потоки заново — src пересоздаётся с той же позиции. */
function scheduleTtlRefresh(ttlSec: number, snapshot: VideoSnapshot) {
  if (ttlTimer) clearTimeout(ttlTimer);
  const key = snapshotKey(snapshot);
  const delay = Math.max(5_000, ttlSec * 1000 - 15_000);
  ttlTimer = setTimeout(() => {
    ttlTimer = null;
    const store = usePlayerStore();
    const current = store.clipPlaybackVideo;
    if (!current || snapshotKey(current) !== key) return;
    void refreshStreams(current);
  }, delay);
}

async function refreshStreams(snapshot: VideoSnapshot) {
  const store = usePlayerStore();
  store.setEngineLoading(true);
  try {
    // Тёплый ответ из кеша (предзагрузка): применяем без сети.
    const cached = getCachedStream(snapshot);
    if (cached?.kind === 'video') {
      if (!store.clipPlaybackVideo || snapshotKey(store.clipPlaybackVideo) !== snapshotKey(snapshot)) return;
      store.setClipStreams(cached.streams);
      store.setClipHls(cached.hls);
      if (!cached.hls) store.clampClipQualityToStreams();
      reapplyStreams();
      scheduleTtlRefresh(Math.max(1, Math.round((cached.expiresAt - Date.now()) / 1000)), snapshot);
      return;
    }
    const payload = await fetchVideoStreams(snapshot);
    if (!store.clipPlaybackVideo || snapshotKey(store.clipPlaybackVideo) !== snapshotKey(snapshot)) return;
    cacheVideoStreams(snapshot, payload.streams, payload.hls, payload.ttl_sec);
    store.setClipStreams(payload.streams);
    store.setClipHls(payload.hls);
    // Прогрессив-режим: выбор качества клампим по списку потоков; в HLS — по высотам манифеста.
    if (!payload.hls) store.clampClipQualityToStreams();
    reapplyStreams();
    scheduleTtlRefresh(payload.ttl_sec, snapshot);
  } catch (cause) {
    // Один тихий пролёт: следующий тогл/смена трека перезапросят, автоповтором не злоупотребляем.
    // Исключение — 502 при привязанных cookies: подсказка обновить экспорт.
    void maybeHintCookies(cause, snapshotKey(snapshot));
  } finally {
    store.setEngineLoading(false);
  }
}

export function useVideoPlayback() {
  const player = usePlayerStore();
  const toast = useToastStore();

  async function loadVideo(snapshot: VideoSnapshot | null) {
    const el = ensureVideo();
    if (ttlTimer && !snapshot) {
      clearTimeout(ttlTimer);
      ttlTimer = null;
    }
    if (!snapshot) {
      runOwned(() => el.pause());
      releaseBuffering();
      setClipFrameReady(false);
      player.setStreamWarming(false);
      if (hlsAttached) {
        hlsDetach();
        hlsAttached = false;
        appliedManifest = null;
      }
      // Подмена/остановка: летящий запрос уже никому не нужен — отменяем.
      loadAbort?.abort();
      loadAbort = null;
      loadedKey = null;
      appliedKey = null;
      progressiveOnlyKey = null;
      player.setClipStreams([]);
      syncAttachment();
      return;
    }
    const key = snapshotKey(snapshot);
    if (key === appliedKey || key === loadedKey) {
      const hasSource = player.clipStreams.length > 0 || player.clipHls != null;
      if (hasSource) {
        // Повтор того же ролика: поток уже стоит, кадр только показываем заново.
        syncAttachment();
        if (!openingArmed()) armOpening();
        armFirstFrame(el);
        return;
      }
      // Потоки сброшены сменой трека. Ключ тот же, источника уже нет —
      // грузим заново, иначе <video> остаётся вне плеера.
      loadedKey = null;
      appliedKey = null;
    }
    // Клип на треке: потоки приехали вместе с resolve — только применяем.
    // Позиция общая с треком: клип стартует с неё (0 — тоже валидная позиция).
    if (player.clipVideo && snapshotKey(player.clipVideo) === key) {
      loadedKey = key;
      appliedKey = key;
      beginOpening();
      applyStream(player.positionSeconds);
      syncAttachment();
      return;
    }
    loadedKey = key;
    // До get-url: прошлый is-ready кадр иначе лежит чёрным поверх новой обложки,
    // а спиннер ждёт waiting и появляется уже на чёрном.
    beginOpening();
    // Тёплые потоки из кеша (предзагрузка/повтор в пределах TTL) — без сети.
    const cached = getCachedStream(snapshot);
    if (cached?.kind === 'video') {
      appliedKey = key;
      player.setClipStreams(cached.streams);
      player.setClipHls(cached.hls);
      if (!cached.hls) player.clampClipQualityToStreams();
      applyStream(player.positionSeconds);
      // Продление от остатка TTL, а не от полного: кеш мог протухнуть частично.
      scheduleTtlRefresh(Math.max(1, Math.round((cached.expiresAt - Date.now()) / 1000)), snapshot);
      syncAttachment();
      return;
    }
    loadAbort?.abort();
    const controller = new AbortController();
    loadAbort = controller;
    player.setEngineLoading(true);
    try {
      const payload = await fetchVideoStreams(snapshot, controller.signal);
      if (controller.signal.aborted) return;
      // Пока запрашивали, видео могло смениться — старое не применяем.
      if (!player.clipPlaybackVideo || snapshotKey(player.clipPlaybackVideo) !== key) {
        if (loadedKey === key) loadedKey = null;
        return;
      }
      appliedKey = key;
      cacheVideoStreams(snapshot, payload.streams, payload.hls, payload.ttl_sec);
      player.setClipStreams(payload.streams);
      player.setClipHls(payload.hls);
      if (!payload.hls) player.clampClipQualityToStreams();
      // Сервер на play уже прислал 0. currentTime элемента — минута прошлого
      // ролика. Пульт берёт экстраполированное зеркало, активное — свой замер.
      applyStream(player.positionSeconds);
      scheduleTtlRefresh(payload.ttl_sec, snapshot);
    } catch (cause) {
      // Отменён следующим запросом — не ошибка, молча выходим.
      if (controller.signal.aborted) return;
      if (loadedKey === key) {
        loadedKey = null;
        releaseBuffering();
      }
      if (!(await maybeHintCookies(cause, key))) {
        toast.show(cause instanceof Error ? cause.message : 'Не удалось загрузить видео', '', true);
      }
    } finally {
      if (loadAbort === controller) loadAbort = null;
      player.setEngineLoading(false);
    }
  }

  /** Резолв «трек → видео»: video null — честно «клипа нет», остаёмся на аудио. */
  async function resolveClip(track: TrackSnapshot) {
    const key = snapshotKey(track);
    const gen = ++resolveGen;
    player.setClipResolving();
    // Спиннер с самого клика: до ответа resolve клипа ещё нет, HLS-ожидание
    // начнётся только после него.
    clipBuffering.value = true;
    resolveAbort?.abort();
    const controller = new AbortController();
    resolveAbort = controller;
    try {
      const payload = await resolveVideo(track, controller.signal);
      if (controller.signal.aborted) return;
      // Пока резолвили, трек мог смениться или режим выключили — старое не применяем.
      if (!player.clipMode || !player.current || snapshotKey(player.current) !== key) {
        if (gen === resolveGen) clipBuffering.value = false;
        return;
      }
      if (!payload.video) {
        player.setClipUnavailable();
        clipBuffering.value = false;
        return;
      }
      player.setClipResolved(track, payload.video, payload.streams);
      scheduleTtlRefresh(payload.ttl_sec, payload.video);
      void loadVideo(payload.video);
      // В resolve нет hls (api.md §8): streams — для немедленного старта,
      // полный ответ с манифестом добираем get-url сразу — движок подменит
      // источник на HLS с той же позиции.
      void refreshStreams(payload.video);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (gen === resolveGen) clipBuffering.value = false;
      if (player.current && snapshotKey(player.current) === key) player.setClipUnavailable();
      if (!(await maybeHintCookies(cause, key))) {
        toast.show(cause instanceof Error ? cause.message : 'Не удалось найти клип', '', true);
      }
    } finally {
      if (resolveAbort === controller) resolveAbort = null;
    }
  }

  // Эффективное видео (снапшот или клип на треке) или роль активного устройства
  // изменились — поднимаем/меняем потоки.
  watch(
    [() => player.clipPlaybackVideo, () => player.isActiveDevice],
    ([snapshot]) => loadVideo(snapshot),
    { immediate: true },
  );

  // Режим клипов на треке: резолвим, пока трек тот же и режим включён.
  // Каждое устройство резолвит себе само: пульт тоже показывает видео (в mute),
  // серверный current_snapshot при этом не трогаем — клип локальная подмена.
  watch(
    [() => player.clipMode, () => player.current, () => useOnlineStore().isOnline],
    ([clipModeOn, snapshot, online]) => {
      if (!clipModeOn || !snapshot || snapshot.type !== 'track') return;
      if (player.clipTrackKey === snapshotKey(snapshot) || player.clipStatus === 'resolving') return;
      if (online === false) {
        player.setClipUnavailable();
        toast.show('Клипы недоступны без сети', '', true);
        return;
      }
      void resolveClip(snapshot);
    },
    { immediate: true },
  );

  // is_playing с сервера: активное устройство подчиняется.
  watch(
    () => player.state.is_playing,
    (shouldPlay) => {
      if (player.clipPlaybackVideo == null) return;
      const el = ensureVideo();
      // Мёртвая ссылка (протухший поток): play() не оживит — перезагружаем.
      if (shouldPlay && el.error) {
        loadedKey = null;
        appliedKey = null;
        void loadVideo(player.clipPlaybackVideo);
        return;
      }
      if (shouldPlay) tryPlay(el);
      else runOwned(() => el.pause());
    },
  );

  // Тап при рассинхроне (сервер: играем, элемент молчит) — пинаем элемент.
  // Мёртвый поток здесь не лечим: ошибка потока и так уводит в фолбэк на аудио.
  watch(
    () => player.engineKick,
    () => {
      if (!player.state.is_playing || !player.clipActive) return;
      tryPlay(ensureVideo());
    },
  );

  // Качество: желаемое регистрируем в движке всегда — если HLS ещё не аттачнут,
  // применится на MANIFEST_PARSED, аттачнут — сразу (hlsSetQuality внутри решает).
  // Прогрессив — смена потока с позиции.
  watch(
    () => [player.clipQuality, player.clipHlsAuto] as const,
    () => {
      hlsSetQuality({ auto: player.clipHlsAuto, height: player.clipQuality });
      if (!hlsAttached) applyStream();
    },
  );

  // Аудиодорожка (дубляж, api.md §8.1): применяем к живой HLS-сессии.
  watch(
    () => player.clipAudioId,
    (id) => {
      if (hlsAttached) hlsSetAudioTrack(id);
    },
  );

  // Обновление потоков (продление TTL) — переприменяем активное качество.
  watch(() => player.clipStreams, () => reapplyStreams());

  // Подгонка дрейфа к серверной позиции — только при большом расхождении.
  watch(
    () => [player.state.position_seconds, player.mediaSeek] as const,
    ([, generation], previous) => {
      const el = video;
      if (!el) return;
      const snap = player.clipPlaybackVideo;
      // Гейт по факту (appliedKey): не seek'ать старое видео по позиции нового.
      if (!snap || snapshotKey(snap) !== appliedKey) return;
      // Цель подгонки: активное — сырой серверный замер (свой репорт); пульт —
      // экстраполированное зеркало, иначе каждый репорт дёргал бы видео назад.
      const position = player.isActiveDevice ? player.state.position_seconds : player.positionSeconds;
      const ended = el.ended;
      const forced = previous != null && generation !== previous[1];
      if (
        Number.isFinite(el.duration) &&
        (forced || Math.abs(el.currentTime - position) > 2.5) &&
        Math.abs(el.currentTime - position) > 0.05
      ) {
        el.currentTime = position;
      }
      // repeat=one: бэк отвечает seek(0) без смены is_playing — элемент после
      // 'ended' остался на паузе, автоповтор должен его возобновить.
      if (ended && player.state.is_playing) void runOwnedAsync(() => el.play().catch(() => undefined));
    },
  );

  watch(
    () => player.volume,
    (percent) => {
      ensureVideo().volume = Math.min(1, Math.max(0, percent / 100));
    },
    { immediate: true },
  );

  // Звук видео — только с активного устройства; пульт смотрит в mute,
  // иначе при клипе на двух экранах был бы двойной звук.
  watch(
    () => player.isActiveDevice,
    (active) => {
      ensureVideo().muted = !active;
    },
    { immediate: true },
  );

  // Хосты появляются/исчезают с развёрнутым/мини-плеером, меняются потоки/
  // видео — элемент крепим/снимаем.
  watch(
    [clipHost, miniClipHost, homeClipHost, () => player.clipStreams.length, () => player.clipHls, () => player.clipPlaybackVideo],
    () => syncAttachment(),
  );

  // События элемента — источник правды о реальном звучании (общий флаг
  // прогресса с аудио-движком: каждый метит, только когда его тип текущий).
  if (!bound) {
    bound = true;
    const el = ensureVideo();
    el.addEventListener('ended', () => {
      releaseBuffering();
      const store = usePlayerStore();
      if (store.isActiveDevice && store.clipActive) store.handleTrackEnded();
    });
    el.addEventListener('loadedmetadata', () => {
      if (resumeAt != null) {
        const target = resumeAt;
        resumeAt = null;
        if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
      }
      revealPausedFrame(el);
    });
    el.addEventListener('seeked', () => {
      revealPausedFrame(el);
      if (openingArmed() && el.videoWidth > 0) armFirstFrame(el);
    });
    el.addEventListener('loadeddata', () => {
      revealPausedFrame(el);
    });
    el.addEventListener('canplay', () => {
      // Данные доехали — если play() после get-url отбраковали, пробуем ещё раз.
      // Прогрев здесь не снимаем: canplay ≠ кадр и ≠ playing.
      tryPlay(el);
      revealPausedFrame(el);
    });
    el.addEventListener('waiting', () => {
      // Сталл при включённом воспроизведении — показываем спиннер; на паузе
      // (в т.ч. перемотка на паузе) спиннер не нужен — там индикатор паузы.
      const store = usePlayerStore();
      if (store.state.is_playing) clipBuffering.value = true;
      holdProgressWhileBuffering(store, el);
    });
    el.addEventListener('stalled', () => {
      holdProgressWhileBuffering(usePlayerStore(), el);
    });
    el.addEventListener('playing', () => {
      const store = usePlayerStore();
      if (!store.clipActive) return;
      store.setPlaybackStalled(false, el.currentTime);
      store.setAudioPlaying(true);
      // playing прошлого ролика приходит уже после смены снапшота — кадр не возвращаем.
      if (!openingArmed()) return;
      releaseBuffering();
      store.setStreamWarming(false);
      armFirstFrame(el);
    });
    el.addEventListener('play', () => {
      const store = usePlayerStore();
      if (store.clipActive && store.isActiveDevice) noteExternalTransport(true);
    });
    el.addEventListener('pause', () => {
      const store = usePlayerStore();
      if (store.clipActive) {
        store.setAudioPlaying(false);
        store.setPlaybackStalled(false, el.currentTime);
      }
      if (store.clipActive && store.isActiveDevice) noteExternalTransport(false);
      // Сервер уже на паузе — крутить нечего, даже если playing так и не было
      // (обновление страницы в play: автоплей не стартовал, буфер на месте).
      if (!store.state.is_playing) releaseBuffering();
      revealPausedFrame(el);
    });
    el.addEventListener('error', () => handleStreamError());
    el.addEventListener('timeupdate', () => {
      const store = usePlayerStore();
      if (!store.isActiveDevice || !store.clipActive || !store.clipPlaybackVideo) return;
      if (snapshotKey(store.clipPlaybackVideo) !== appliedKey) return;
      if (!openingArmed()) return;
      // Пока элемент не ушёл со старой секунды — не пинговать её как позицию нового ролика.
      if (resumeTarget != null && Math.abs(el.currentTime - resumeTarget) > 2.5) return;
      resumeTarget = null;
      store.anchorFromAudio(el.currentTime);
    });
  }
}
