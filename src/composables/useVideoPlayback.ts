import { ref, watch } from 'vue';
import { fetchVideoStreams, resolveVideo } from '@/api/videos';
import type { VideoHls } from '@/api/videos';
import { ApiError } from '@/api/http';
import { hlsDetach, hlsLoad, hlsSetAudioTrack, hlsSetQuality, hlsSupported, setHlsHooks } from '@/lib/hls-engine';
import { snapshotKey } from '@/lib/playback-engine';
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
 */

let video: HTMLVideoElement | null = null;
let bound = false;
/** Задержка одинарного тапа: за это время успевает прийти dblclick. */
const TAP_FULLSCREEN_DELAY_MS = 260;
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

/** Хост в развёрнутом плеере: сюда крепится видео-элемент (null — свёрнут/не клип). */
const clipHost = ref<HTMLElement | null>(null);
/** Хост в мини-плеере: сворачивание перекладывает видео сюда — клип поёт дальше. */
const miniClipHost = ref<HTMLElement | null>(null);

setHlsHooks({
  onError: () => handleStreamError(),
  onHeights: (heights) => usePlayerStore().setClipHlsHeights(heights),
  onAudioTracks: (tracks) => usePlayerStore().setClipAudioTracks(tracks),
});

export function setClipHost(el: HTMLElement | null) {
  clipHost.value = el;
}

export function setMiniClipHost(el: HTMLElement | null) {
  miniClipHost.value = el;
}

/** Полный экран по двойному тапу — на сам элемент, чтобы работало из мини-плеера. */
export function toggleClipFullscreen() {
  const el = video;
  if (!el || !usePlayerStore().clipActive) return;
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else void el.requestFullscreen().catch(() => undefined);
}

/**
 * Пара обработчиков тапов по клипу: одинарный — пауза/плей через стор (все
 * устройства подчиняются), двойной — полный экран. Одинарный ждёт
 * TAP_FULLSCREEN_DELAY_MS: браузер шлёт click, click, dblclick, и без паузы
 * плей переключился бы дважды перед разворачиванием. Компонент вешает
 * обработчики на свой хост: в развёрнутом плеере тап до элемента доходит
 * только через всплытие (см. NowPlaying).
 */
export function clipTapHandlers() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const click = () => {
    if (!usePlayerStore().clipActive) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void usePlayerStore().togglePlay();
    }, TAP_FULLSCREEN_DELAY_MS);
  };
  const dblclick = () => {
    if (!usePlayerStore().clipActive) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    toggleClipFullscreen();
  };
  return { click, dblclick };
}

function ensureVideo(): HTMLVideoElement {
  if (!video) {
    video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    video.className = 'clip-video';
  }
  return video;
}

/** Потоки текущего эффективного видео обновились — переприменить с сохранением позиции. */
function reapplyStreams() {
  if (!usePlayerStore().isActiveDevice) return;
  applyStream();
}

function applyStream(resumePosition?: number) {
  const el = ensureVideo();
  const player = usePlayerStore();
  // HLS сдался на этом видео (повторная ошибка) — доигрываем прогрессивом.
  const hls = progressiveOnlyKey === appliedKey ? null : player.clipHls;
  if (hls) {
    applyHls(el, hls, resumePosition);
    syncAttachment();
    return;
  }
  // Позицию снимаем до detach: он пересоздаёт элемент и обнуляет currentTime.
  const resume =
    resumePosition ??
    (Number.isFinite(el.currentTime) && el.currentTime > 0 ? el.currentTime : null);
  if (hlsAttached) {
    hlsDetach();
    hlsAttached = false;
    appliedManifest = null;
  }
  const stream = activeStream(player.clipStreams, player.clipQuality);
  if (!stream || el.src === stream.url) return;
  // Свежий клип на треке стартует с серверной позиции трека; смена качества
  // и продление TTL — с текущей позиции элемента.
  resumeAt = resume;
  el.src = stream.url;
  if (player.isActiveDevice && player.state.is_playing) void el.play().catch(() => undefined);
  syncAttachment();
}

/** HLS-режим (api.md §8.1): манифест через hls.js, дорожка и качество — его API. */
function applyHls(el: HTMLVideoElement, hls: VideoHls, resumePosition?: number) {
  const player = usePlayerStore();
  hlsSetAudioTrack(player.clipAudioId);
  hlsSetQuality({ auto: player.clipHlsAuto, height: player.clipQuality });
  const switching = appliedManifest !== hls.manifest_url;
  if (switching) {
    // Аттач/смена манифеста рестартуют поток: позицию ловит loadedmetadata (resumeAt).
    resumeAt =
      resumePosition ??
      (Number.isFinite(el.currentTime) && el.currentTime > 0 ? el.currentTime : null);
  }
  void (async () => {
    // MSE нет (старый WebView) — манифест не поднять, честный фолбэк на прогрессив.
    if (!(await hlsSupported())) {
      handleStreamError();
      return;
    }
    const attached = await hlsLoad(el, hls.manifest_url);
    appliedManifest = hls.manifest_url;
    hlsAttached = true;
    // Аттач асинхронный (ленивый hls.js): вотчер is_playing уже отстрелил — догоняем плей.
    const store = usePlayerStore();
    if (attached && store.isActiveDevice && store.state.is_playing) {
      void el.play().catch(() => undefined);
    }
  })().catch(() => handleStreamError());
}

/**
 * Ошибка потока/сегмента (api.md §8.1): один повторный get-url с подменой
 * источника; повторная — HLS сдаётся в пользу прогрессива, прогрессив —
 * честный фолбэк на аудио трека.
 */
function handleStreamError() {
  const store = usePlayerStore();
  if (store.current?.type === 'video') {
    // Чистое видео из выдачи: аудио-фолбэка нет — только глушим флаг звучания.
    store.setAudioPlaying(false);
    return;
  }
  if (!store.isActiveDevice || !store.clipActive) return;
  const key = appliedKey;
  if (!key) return;
  if (streamRetryKey !== key) {
    streamRetryKey = key;
    streamRetries = 0;
  }
  if (streamRetries === 0) {
    streamRetries = 1;
    const current = store.clipPlaybackVideo;
    if (current) void refreshStreams(current);
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

function syncAttachment() {
  const el = ensureVideo();
  const player = usePlayerStore();
  const host = clipHost.value ?? miniClipHost.value;
  const playable = player.clipStreams.length > 0 || player.clipHls != null;
  const show = host != null && player.clipPlaybackVideo != null && playable;
  if (show && host && el.parentElement !== host) host.appendChild(el);
  // Из DOM убираем только когда играть нечего. Хоста нет (домашняя без
  // мини-плеера) — элемент остаётся без родителя, воспроизведение продолжается.
  if (!show && el.parentElement && (player.clipPlaybackVideo == null || !playable)) el.remove();
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
    if (!store.isActiveDevice || !current || snapshotKey(current) !== key) return;
    void refreshStreams(current);
  }, delay);
}

async function refreshStreams(snapshot: VideoSnapshot) {
  const store = usePlayerStore();
  store.setEngineLoading(true);
  try {
    const payload = await fetchVideoStreams(snapshot);
    if (!store.clipPlaybackVideo || snapshotKey(store.clipPlaybackVideo) !== snapshotKey(snapshot)) return;
    store.setClipStreams(payload.streams);
    store.setClipHls(payload.hls);
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
    if (!player.isActiveDevice || !snapshot) {
      el.pause();
      if (hlsAttached) {
        hlsDetach();
        hlsAttached = false;
        appliedManifest = null;
      }
      // Подмена/остановка: летящий запрос уже никому не нужен — отменяем.
      loadAbort?.abort();
      loadAbort = null;
      loadedKey = null;
      if (!snapshot) {
        appliedKey = null;
        progressiveOnlyKey = null;
        player.setClipStreams([]);
      }
      syncAttachment();
      return;
    }
    const key = snapshotKey(snapshot);
    if (key === appliedKey || key === loadedKey) return;
    // Клип на треке: потоки приехали вместе с resolve — только применяем.
    // Позиция общая с треком: клип стартует с неё (0 — тоже валидная позиция).
    if (player.clipVideo && snapshotKey(player.clipVideo) === key) {
      loadedKey = key;
      appliedKey = key;
      applyStream(player.positionSeconds);
      syncAttachment();
      return;
    }
    loadedKey = key;
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
      player.setClipStreams(payload.streams);
      player.setClipHls(payload.hls);
      applyStream();
      scheduleTtlRefresh(payload.ttl_sec, snapshot);
    } catch (cause) {
      // Отменён следующим запросом — не ошибка, молча выходим.
      if (controller.signal.aborted) return;
      if (loadedKey === key) loadedKey = null;
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
    player.setClipResolving();
    resolveAbort?.abort();
    const controller = new AbortController();
    resolveAbort = controller;
    try {
      const payload = await resolveVideo(track, controller.signal);
      if (controller.signal.aborted) return;
      // Пока резолвили, трек мог смениться или режим выключили — старое не применяем.
      if (!player.clipMode || !player.current || snapshotKey(player.current) !== key) return;
      if (!payload.video) {
        player.setClipUnavailable();
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
  watch(
    [() => player.clipMode, () => player.current, () => player.isActiveDevice, () => useOnlineStore().isOnline],
    ([clipModeOn, snapshot, active, online]) => {
      if (!clipModeOn || !active || !snapshot || snapshot.type !== 'track') return;
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
    () => player.isActiveDevice && player.state.is_playing,
    (shouldPlay) => {
      if (!player.isActiveDevice || player.clipPlaybackVideo == null) return;
      const el = ensureVideo();
      // Мёртвая ссылка (протухший поток): play() не оживит — перезагружаем.
      if (shouldPlay && el.error) {
        loadedKey = null;
        appliedKey = null;
        void loadVideo(player.clipPlaybackVideo);
        return;
      }
      if (shouldPlay) void el.play().catch(() => undefined);
      else el.pause();
    },
  );

  // Тап при рассинхроне (сервер: играем, элемент молчит) — пинаем элемент.
  // Мёртвый поток здесь не лечим: ошибка потока и так уводит в фолбэк на аудио.
  watch(
    () => player.engineKick,
    () => {
      if (!player.isActiveDevice || !player.state.is_playing || !player.clipActive) return;
      void ensureVideo().play().catch(() => undefined);
    },
  );

  // Качество: в HLS — потолок ABR или фикс через hls.js; прогрессив — смена потока с позиции.
  watch(
    () => [player.clipQuality, player.clipHlsAuto] as const,
    () => {
      if (hlsAttached) hlsSetQuality({ auto: player.clipHlsAuto, height: player.clipQuality });
      else applyStream();
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
    () => player.state.position_seconds,
    (position) => {
      const el = video;
      if (!el || !player.isActiveDevice) return;
      const snap = player.clipPlaybackVideo;
      // Гейт по факту (appliedKey): не seek'ать старое видео по позиции нового.
      if (!snap || snapshotKey(snap) !== appliedKey) return;
      const ended = el.ended;
      if (Number.isFinite(el.duration) && Math.abs(el.currentTime - position) > 2.5) {
        el.currentTime = position;
      }
      // repeat=one: бэк отвечает seek(0) без смены is_playing — элемент после
      // 'ended' остался на паузе, автоповтор должен его возобновить.
      if (ended && player.state.is_playing) void el.play().catch(() => undefined);
    },
  );

  watch(
    () => player.volume,
    (percent) => {
      ensureVideo().volume = Math.min(1, Math.max(0, percent / 100));
    },
    { immediate: true },
  );

  // Хосты появляются/исчезают с развёрнутым/мини-плеером, меняются потоки/
  // видео — элемент крепим/снимаем.
  watch(
    [clipHost, miniClipHost, () => player.clipStreams.length, () => player.clipPlaybackVideo],
    () => syncAttachment(),
  );

  // События элемента — источник правды о реальном звучании (общий флаг
  // прогресса с аудио-движком: каждый метит, только когда его тип текущий).
  if (!bound) {
    bound = true;
    const el = ensureVideo();
    el.addEventListener('ended', () => {
      const store = usePlayerStore();
      if (store.isActiveDevice && store.clipActive) store.handleTrackEnded();
    });
    el.addEventListener('loadedmetadata', () => {
      if (resumeAt != null) {
        el.currentTime = resumeAt;
        resumeAt = null;
      }
    });
    el.addEventListener('playing', () => {
      const store = usePlayerStore();
      if (store.clipActive) store.setAudioPlaying(true);
    });
    el.addEventListener('pause', () => {
      const store = usePlayerStore();
      if (store.clipActive) store.setAudioPlaying(false);
    });
    el.addEventListener('error', () => handleStreamError());
    el.addEventListener('timeupdate', () => {
      const store = usePlayerStore();
      if (!store.isActiveDevice || !store.clipActive || !store.clipPlaybackVideo) return;
      if (snapshotKey(store.clipPlaybackVideo) !== appliedKey) return;
      store.anchorFromAudio(el.currentTime);
    });
  }
}
