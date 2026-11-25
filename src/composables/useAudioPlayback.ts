import { watch } from 'vue';
import { fetchAudioUrl } from '@/api/audio';
import { isLocalPlaybackUrl } from '@/lib/download-files';
import { afterMediaUnlock, isAutoplayBlocked, markAutoplayBlocked } from '@/lib/media-unlock';
import { snapshotKey } from '@/lib/playback-engine';
import { cacheAudioUrl, getCachedStream, invalidateStream } from '@/lib/stream-url-cache';
import { useDownloadsStore } from '@/stores/downloads';
import { useOnlineStore } from '@/stores/online';
import { noteExternalTransport, runOwned, runOwnedAsync } from '@/lib/media-keys';
import { usePlayerStore } from '@/stores/player';
import type { AnySnapshot } from '@/types';

/**
 * Аудио-движок (plan-player.md §7 п.4): поток через `/audio/get-url`,
 * `ended` → движок → `/play`. Звучит только активное устройство;
 * пульт синхронизирует UI и молчит.
 */

let audio: HTMLAudioElement | null = null;
let bound = false;
/** Ключ трека, для которого уже поднят поток — сравнение по snapshotKey,
 *  а не по идентичности объекта (каждый ответ сервера создаёт новый). */
let loadedKey: string | null = null;
/** Ключ трека, чей поток реально стоит в элементе (loadedKey — лишь бронь до ответа). */
let appliedKey: string | null = null;
/** Летящий запрос: следующий запуск его отменяет — при быстром скипе на бэк
 *  уходит только последний запрос, а не вся пролистанная очередь. */
let loadAbort: AbortController | null = null;
/** Позиция для восстановления после подмены клипом: src пересоздаёт поток. */
let resumeAt: number | null = null;
/** Локальный файл один раз не открылся — дальше этот трек идёт через поток. */
const localFailed = new Set<string>();

/** Какая попытка play() ещё актуальна: опоздавший отказ не гасит новый прогрев. */
let playAttempt = 0;

/**
 * Прогрев до playing: canplay на медленной ссылке раньше звука.
 * Отказ play() (перезагрузка без жеста, автоплей) — это не загрузка:
 * спиннер снимаем, иначе он крутится при уже отвеченных запросах.
 */
function tryPlay(el: HTMLAudioElement) {
  const player = usePlayerStore();
  if (!player.isActiveDevice || !player.state.is_playing) return;
  if (player.effectiveCurrent?.type !== 'track') return;
  if (!el.paused && !el.ended) return;
  if (isAutoplayBlocked()) return;
  const attempt = ++playAttempt;
  player.setStreamWarming(true);
  afterMediaUnlock(() => {
    const store = usePlayerStore();
    const stale = () => attempt !== playAttempt;
    if (stale()) return;
    if (!store.isActiveDevice || !store.state.is_playing || store.effectiveCurrent?.type !== 'track' || el.ended) {
      store.setStreamWarming(false);
      return;
    }
    if (!el.paused) return;
    void runOwnedAsync(() =>
      el.play().catch((error: unknown) => {
        if (stale()) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof DOMException && error.name === 'NotAllowedError') markAutoplayBlocked();
        store.setStreamWarming(false);
      }),
    );
  });
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
  }
  return audio;
}

/** Аудио-элемент (singleton) — для чтения buffered в UI (шкала буфера). */
export function getAudioElement(): HTMLAudioElement | null {
  return audio;
}

export function useAudioPlayback() {
  const player = usePlayerStore();

  async function loadSnapshot(snapshot: AnySnapshot | null) {
    const el = ensureAudio();
    // Клип подменяет трек: пока эффективный снапшот — видео, аудио молчит.
    // Поток сбрасываем целиком: вернёмся за свежей ссылкой и общей позицией
    // (за время клипа позиция ушла вперёд — элемент с места остановки
    // не продолжает).
    if (!player.isActiveDevice || !snapshot || snapshot.type !== 'track') {
      runOwned(() => el.pause());
      // Подмена/остановка: летящий запрос уже никому не нужен — отменяем.
      loadAbort?.abort();
      loadAbort = null;
      loadedKey = null;
      appliedKey = null;
      return;
    }
    const key = snapshotKey(snapshot);
    // Бронь до ответа: параллельные вспышки вотчера (несколько апдейтов
    // стейта подряд) с тем же треком не должны дёргать лишний fetch.
    if (key === appliedKey || key === loadedKey) return;
    loadedKey = key;
    loadAbort?.abort();
    const controller = new AbortController();
    loadAbort = controller;
    // Позиция для старта — с момента ТЕКУЩЕГО снапшота: пока летит ссылка,
    // старый элемент ещё играет и его timeupdate пересаживает якорь стора на
    // позицию старого трека — читать позицию по окончании fetch нельзя.
    const startPosition = player.positionSeconds;
    const downloaded = useDownloadsStore().isDownloaded(snapshot);
    if (!localFailed.has(key)) {
      const local = await useDownloadsStore().localUrl(snapshot);
      if (controller.signal.aborted) return;
      if (!player.effectiveCurrent || snapshotKey(player.effectiveCurrent) !== key) {
        if (loadedKey === key) loadedKey = null;
        return;
      }
      if (local) {
        appliedKey = key;
        el.src = local;
        resumeAt = startPosition;
        tryPlay(el);
        return;
      }
    }
    // Файл уже в скачанном: get-url не просим, даже если локальный URL не открылся.
    if (downloaded) {
      if (loadedKey === key) loadedKey = null;
      return;
    }
    // Офлайн без файла молчит. Ссылка из SkyFiStreamUrls — адрес Яндекса,
    // браузер играет её из своего кеша и без нашего бэкенда.
    if (useOnlineStore().isOnline === false) {
      if (loadedKey === key) loadedKey = null;
      appliedKey = null;
      runOwned(() => el.pause());
      el.removeAttribute('src');
      return;
    }
    // Тёплая ссылка из кеша (предзагрузка/повтор в пределах TTL) — без сети.
    const cached = getCachedStream(snapshot);
    if (cached?.kind === 'audio') {
      appliedKey = key;
      el.src = cached.url;
      resumeAt = startPosition;
      tryPlay(el);
      return;
    }
    player.setEngineLoading(true);
    try {
      const { url, ttlSec } = await fetchAudioUrl(snapshot, controller.signal);
      cacheAudioUrl(snapshot, url, ttlSec);
      // Пока запрашивали ссылку, эффективный снапшот мог смениться (клип,
      // другой трек) — не грузим старое.
      if (!player.effectiveCurrent || snapshotKey(player.effectiveCurrent) !== key) {
        if (loadedKey === key) loadedKey = null;
        return;
      }
      appliedKey = key;
      el.src = url;
      // Продолжаем с общей позиции: после клипа она ушла вперёд, при обычном
      // старте трека позиция ~0 и seek на 0 — безопасный no-op.
      resumeAt = startPosition;
      tryPlay(el);
    } catch {
      // Отменён следующим запросом — не ошибка, молча выходим.
      if (controller.signal.aborted) return;
      if (loadedKey === key) loadedKey = null;
      /* ошибку команды уже показал стор */
    } finally {
      if (loadAbort === controller) loadAbort = null;
      player.setEngineLoading(false);
    }
  }

  // Смена эффективного снапшота (трек/клип) или роли активного устройства —
  // повод подгрузить поток или замолчать.
  watch([() => player.effectiveCurrent, () => player.isActiveDevice], ([snapshot]) => loadSnapshot(snapshot), {
    immediate: true,
  });

  // is_playing с сервера: активное устройство подчиняется, пульт глушит звук.
  // Пока эффективный снапшот — клип, элемент не трогаем: src старый, иначе
  // воспроизведение пошло бы одновременно с видео.
  watch(
    () => player.isActiveDevice && player.state.is_playing,
    (shouldPlay) => {
      const el = ensureAudio();
      if (!player.isActiveDevice || player.effectiveCurrent?.type !== 'track') {
        runOwned(() => el.pause());
        return;
      }
      // Мёртвая ссылка (протухший поток): play() не оживит — перезагружаем.
      if (shouldPlay && el.error) {
        if (isLocalPlaybackUrl(el.currentSrc) || isLocalPlaybackUrl(el.src)) {
          localFailed.add(snapshotKey(player.effectiveCurrent));
        }
        loadedKey = null;
        appliedKey = null;
        invalidateStream(player.effectiveCurrent);
        void loadSnapshot(player.effectiveCurrent);
        return;
      }
      if (shouldPlay) tryPlay(el);
      else runOwned(() => el.pause());
    },
  );

  // Подгонка дрейфа к серверной позиции — только при большом расхождении
  // (иначе собственный периодический репорт позиции дёргал бы воспроизведение).
  // Только когда поток соответствует текущему треку: сразу после смены трека
  // позиция сервера — уже новая (0), а в элементе ещё играет старый трек.
  watch(
    () => [player.state.position_seconds, player.mediaSeek] as const,
    ([position, generation], previous) => {
      const el = audio;
      if (!el || !player.isActiveDevice) return;
      // Гейт по факту (appliedKey): пока летит ссылка, в элементе ещё старый
      // трек — seek'ать его по позиции нового нельзя.
      if (!player.effectiveCurrent || snapshotKey(player.effectiveCurrent) !== appliedKey) return;
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
      if (ended && player.state.is_playing) tryPlay(el);
    },
  );

  // Тап при рассинхроне (сервер: играем, элемент молчит) — пинаем элемент.
  // Убитый поток (el.error) перезагружаем: play() мёртвой ссылке не поможет.
  watch(
    () => player.engineKick,
    () => {
      if (!player.isActiveDevice || !player.state.is_playing) return;
      if (player.effectiveCurrent?.type !== 'track') return;
      const el = ensureAudio();
      if (el.error) {
        if (isLocalPlaybackUrl(el.currentSrc) || isLocalPlaybackUrl(el.src)) {
          localFailed.add(snapshotKey(player.effectiveCurrent));
        }
        loadedKey = null;
        appliedKey = null;
        invalidateStream(player.effectiveCurrent);
        void loadSnapshot(player.effectiveCurrent);
        return;
      }
      tryPlay(el);
    },
  );

  watch(
    () => player.volume,
    (percent) => {
      ensureAudio().volume = Math.min(1, Math.max(0, percent / 100));
    },
    { immediate: true },
  );

  // События элемента — источник правды о реальном звучании: стор экстраполирует
  // позицию только пока audioPlaying (иначе прогресс бежит вперёд звука, пока
  // догружается ссылка), а timeupdate подгоняет якорь к currentTime элемента.
  if (!bound) {
    bound = true;
    const el = ensureAudio();
    el.addEventListener('ended', () => {
      const store = usePlayerStore();
      // Клип активен — переходом управляет видео-элемент, аудио лишь замолчало.
      if (store.isActiveDevice && store.effectiveCurrent?.type === 'track') store.handleTrackEnded();
    });
    el.addEventListener('loadedmetadata', () => {
      if (resumeAt != null) {
        el.currentTime = resumeAt;
        resumeAt = null;
      }
    });
    el.addEventListener('canplay', () => {
      // Ссылка доехала — play() после get-url мог быть отбракован, пробуем снова.
      tryPlay(el);
    });
    el.addEventListener('play', () => {
      const store = usePlayerStore();
      if (store.effectiveCurrent?.type !== 'track' || !store.isActiveDevice) return;
      noteExternalTransport(true);
    });
    el.addEventListener('playing', () => {
      const store = usePlayerStore();
      if (store.effectiveCurrent?.type !== 'track') return;
      store.setAudioPlaying(true);
      store.setStreamWarming(false);
    });
    el.addEventListener('pause', () => {
      const store = usePlayerStore();
      if (store.effectiveCurrent?.type === 'track') store.setAudioPlaying(false);
      if (store.effectiveCurrent?.type === 'track' && store.isActiveDevice) noteExternalTransport(false);
    });
    el.addEventListener('error', () => {
      const store = usePlayerStore();
      resumeAt = null;
      if (store.effectiveCurrent?.type === 'track') {
        store.setAudioPlaying(false);
        invalidateStream(store.effectiveCurrent);
      }
    });
    el.addEventListener('timeupdate', () => {
      const store = usePlayerStore();
      if (!store.isActiveDevice || store.effectiveCurrent?.type !== 'track') return;
      // Гейт по факту (appliedKey): таймапдейты ещё играющего старого трека
      // во время подгрузки нового не должны пересаживать якорь.
      if (snapshotKey(store.effectiveCurrent) !== appliedKey) return;
      store.anchorFromAudio(el.currentTime);
    });
  }
}
