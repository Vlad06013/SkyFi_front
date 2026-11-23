import { ref, watch } from 'vue';
import { fetchVideoStreams } from '@/api/videos';
import { snapshotKey } from '@/lib/playback-engine';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type { VideoSnapshot } from '@/types';

/**
 * Видео-движок (клипы, api.md §8): потоки через `/videos/get-url` со ссылками
 * в разных качествах. Список качеств селекта — из ответа; пунктов лестницы,
 * которых в ответе нет, селект рисует неактивными. Картинка крепится в хост
 * развёрнутого плеера; сворачивание убирает видео из DOM, но воспроизведение
 * продолжается звуком (как аудио-движок).
 */

let video: HTMLVideoElement | null = null;
let bound = false;
/** Ключ видео, для которого уже подняты потоки — сравнение по snapshotKey. */
let loadedKey: string | null = null;
/** Ключ видео, чьи потоки реально стоят в элементе (loadedKey — бронь до ответа). */
let appliedKey: string | null = null;
/** Летящий запрос: следующий его отменяет — при быстром скипе уходит только последний. */
let loadAbort: AbortController | null = null;
/** Позиция для восстановления после смены качества: src пересоздаёт поток. */
let resumeAt: number | null = null;

/** Хост в развёрнутом плеере: сюда крепится видео-элемент (null — свёрнут/не клип). */
const clipHost = ref<HTMLElement | null>(null);

export function setClipHost(el: HTMLElement | null) {
  clipHost.value = el;
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

export function useVideoPlayback() {
  const player = usePlayerStore();
  const toast = useToastStore();

  function currentVideo(): VideoSnapshot | null {
    const snap = player.current;
    return snap && snap.type === 'video' ? snap : null;
  }

  /** Активный поток: выбранное качество, если есть; иначе максимум из доступных. */
  function activeStream() {
    const streams = player.clipStreams;
    return (
      streams.find((stream) => stream.quality === player.clipQuality) ??
      [...streams].sort((a, b) => b.quality - a.quality)[0]
    );
  }

  function syncAttachment() {
    const el = ensureVideo();
    const show = clipHost.value != null && currentVideo() != null && player.clipStreams.length > 0;
    if (show && clipHost.value && el.parentElement !== clipHost.value) clipHost.value.appendChild(el);
    if (!show && el.parentElement) el.remove();
  }

  function applyStream() {
    const el = ensureVideo();
    const stream = activeStream();
    if (!stream || el.src === stream.url) return;
    resumeAt = Number.isFinite(el.currentTime) && el.currentTime > 0 ? el.currentTime : null;
    el.src = stream.url;
    if (player.isActiveDevice && player.state.is_playing) void el.play().catch(() => undefined);
    syncAttachment();
  }

  async function loadVideo(snapshot: VideoSnapshot | null) {
    const el = ensureVideo();
    if (!player.isActiveDevice || !snapshot) {
      el.pause();
      // Подмена/остановка: летящий запрос уже никому не нужен — отменяем.
      loadAbort?.abort();
      loadAbort = null;
      loadedKey = null;
      if (!snapshot) {
        appliedKey = null;
        player.setClipStreams([]);
      }
      syncAttachment();
      return;
    }
    const key = snapshotKey(snapshot);
    if (key === appliedKey || key === loadedKey) return;
    loadedKey = key;
    loadAbort?.abort();
    const controller = new AbortController();
    loadAbort = controller;
    try {
      const payload = await fetchVideoStreams(snapshot, controller.signal);
      if (controller.signal.aborted) return;
      // Пока запрашивали, видео могло смениться — старое не применяем.
      const now = currentVideo();
      if (!now || snapshotKey(now) !== key) {
        if (loadedKey === key) loadedKey = null;
        return;
      }
      appliedKey = key;
      player.setClipStreams(payload.streams);
      applyStream();
    } catch (cause) {
      // Отменён следующим запросом — не ошибка, молча выходим.
      if (controller.signal.aborted) return;
      if (loadedKey === key) loadedKey = null;
      toast.show(cause instanceof Error ? cause.message : 'Не удалось загрузить видео', '', true);
    } finally {
      if (loadAbort === controller) loadAbort = null;
    }
  }

  // Смена видео или получение роли активного устройства — повод подгрузить потоки.
  watch(
    [() => player.current, () => player.isActiveDevice],
    ([snapshot]) => loadVideo(snapshot && snapshot.type === 'video' ? snapshot : null),
    { immediate: true },
  );

  // is_playing с сервера: активное устройство подчиняется.
  watch(
    () => player.isActiveDevice && player.state.is_playing,
    (shouldPlay) => {
      if (!player.isActiveDevice || currentVideo() == null) return;
      const el = ensureVideo();
      if (shouldPlay) void el.play().catch(() => undefined);
      else el.pause();
    },
  );

  // Смена качества в селекте — переключаем поток с сохранением позиции.
  watch(() => player.clipQuality, () => applyStream());

  // Подгонка дрейфа к серверной позиции — только при большом расхождении.
  watch(
    () => player.state.position_seconds,
    (position) => {
      const el = video;
      if (!el || !player.isActiveDevice) return;
      const snap = currentVideo();
      if (!snap || snapshotKey(snap) !== loadedKey) return;
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

  // Хост появляется/исчезает с развёрнутым плеером — видео крепим/снимаем.
  watch(
    [clipHost, () => player.clipStreams.length, () => player.current?.type],
    () => syncAttachment(),
  );

  // События элемента — источник правды о реальном звучании (общий флаг
  // прогресса с аудио-движком: каждый метит, только когда его тип текущий).
  if (!bound) {
    bound = true;
    const el = ensureVideo();
    el.addEventListener('ended', () => {
      const store = usePlayerStore();
      if (store.isActiveDevice && store.current?.type === 'video') store.handleTrackEnded();
    });
    el.addEventListener('loadedmetadata', () => {
      if (resumeAt != null) {
        el.currentTime = resumeAt;
        resumeAt = null;
      }
    });
    el.addEventListener('playing', () => {
      if (usePlayerStore().current?.type === 'video') usePlayerStore().setAudioPlaying(true);
    });
    el.addEventListener('pause', () => {
      if (usePlayerStore().current?.type === 'video') usePlayerStore().setAudioPlaying(false);
    });
    el.addEventListener('error', () => {
      if (usePlayerStore().current?.type === 'video') usePlayerStore().setAudioPlaying(false);
    });
    el.addEventListener('timeupdate', () => {
      const store = usePlayerStore();
      if (!store.isActiveDevice || store.current?.type !== 'video') return;
      if (snapshotKey(store.current) !== loadedKey) return;
      store.anchorFromAudio(el.currentTime);
    });
  }
}
