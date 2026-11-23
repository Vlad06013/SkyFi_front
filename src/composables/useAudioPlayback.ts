import { watch } from 'vue';
import { fetchAudioUrl } from '@/api/audio';
import { snapshotKey } from '@/lib/playback-engine';
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

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
  }
  return audio;
}

export function useAudioPlayback() {
  const player = usePlayerStore();

  async function loadSnapshot(snapshot: AnySnapshot | null) {
    const el = ensureAudio();
    if (!player.isActiveDevice || !snapshot || snapshot.type !== 'track') {
      el.pause();
      // Подмена/остановка: летящий запрос уже никому не нужен — отменяем.
      loadAbort?.abort();
      loadAbort = null;
      loadedKey = null;
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
    try {
      const { url } = await fetchAudioUrl(snapshot, controller.signal);
      // Пока запрашивали ссылку, трек мог смениться — не грузим старое.
      if (!player.current || snapshotKey(player.current) !== key) {
        if (loadedKey === key) loadedKey = null;
        return;
      }
      appliedKey = key;
      el.src = url;
      if (player.state.is_playing) void el.play().catch(() => undefined);
    } catch {
      // Отменён следующим запросом — не ошибка, молча выходим.
      if (controller.signal.aborted) return;
      if (loadedKey === key) loadedKey = null;
      /* ошибку команды уже показал стор */
    } finally {
      if (loadAbort === controller) loadAbort = null;
    }
  }

  // Смена трека или получение роли активного устройства — повод подгрузить поток.
  watch([() => player.current, () => player.isActiveDevice], ([snapshot]) => loadSnapshot(snapshot), {
    immediate: true,
  });

  // is_playing с сервера: активное устройство подчиняется, пульт глушит звук.
  watch(
    () => player.isActiveDevice && player.state.is_playing,
    (shouldPlay) => {
      const el = ensureAudio();
      if (!player.isActiveDevice) {
        el.pause();
        return;
      }
      if (shouldPlay) void el.play().catch(() => undefined);
      else el.pause();
    },
  );

  // Подгонка дрейфа к серверной позиции — только при большом расхождении
  // (иначе собственный периодический репорт позиции дёргал бы воспроизведение).
  // Только когда поток соответствует текущему треку: сразу после смены трека
  // позиция сервера — уже новая (0), а в элементе ещё играет старый трек.
  watch(
    () => player.state.position_seconds,
    (position) => {
      const el = audio;
      if (!el || !player.isActiveDevice) return;
      if (!player.current || snapshotKey(player.current) !== loadedKey) return;
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
      if (store.isActiveDevice) store.handleTrackEnded();
    });
    el.addEventListener('playing', () => {
      if (usePlayerStore().current?.type === 'track') usePlayerStore().setAudioPlaying(true);
    });
    el.addEventListener('pause', () => {
      if (usePlayerStore().current?.type === 'track') usePlayerStore().setAudioPlaying(false);
    });
    el.addEventListener('error', () => {
      if (usePlayerStore().current?.type === 'track') usePlayerStore().setAudioPlaying(false);
    });
    el.addEventListener('timeupdate', () => {
      const store = usePlayerStore();
      if (!store.isActiveDevice || store.current?.type !== 'track') return;
      if (snapshotKey(store.current) !== loadedKey) return;
      store.anchorFromAudio(el.currentTime);
    });
  }
}
