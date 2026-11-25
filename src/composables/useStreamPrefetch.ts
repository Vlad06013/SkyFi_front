import { watch } from 'vue';
import { fetchAudioUrl } from '@/api/audio';
import { fetchVideoStreams, resolveVideo } from '@/api/videos';
import { snapshotKey } from '@/lib/playback-engine';
import { cacheAudioUrl, cacheVideoStreams, getCachedStream } from '@/lib/stream-url-cache';
import { useAuthStore } from '@/stores/auth';
import { useOnlineStore } from '@/stores/online';
import { usePlayerStore } from '@/stores/player';
import type { AnySnapshot, TrackSnapshot, VideoSnapshot } from '@/types';

/**
 * Предзагрузка stream URL (frontend.md §9): устройство воспроизведения греет
 * ссылки 2 трека вперёд и 2 назад (волна — та же схема: окно её контекста
 * движок берёт как обычный список). Греем ТОЛЬКО ссылки (get-url) — байты
 * не трогаем. Кеш по snapshotKey до TTL: тёплая — не просим, дохлая —
 * перезапрашиваем. Только активное устройство, только онлайн, на паузе
 * молчим. Ошибки глотаем: предзагрузка не тостит и не ломает плеер.
 */

const AHEAD_COUNT = 2;
const BACK_COUNT = 2;

/** Резолв «трек → видео» (60/мин) не чаще раза в 5 минут на один трек. */
const CLIP_RESOLVE_REUSE_MS = 5 * 60_000;

/** Летящие запросы: один ключ — один прогрев. */
const inflight = new Set<string>();
let lastClipResolveKey: string | null = null;
let lastClipResolveAt = 0;

export function useStreamPrefetch() {
  const player = usePlayerStore();
  const online = useOnlineStore();
  const auth = useAuthStore();

  async function ensureAudio(snapshot: AnySnapshot): Promise<void> {
    if (getCachedStream(snapshot)?.kind === 'audio') return;
    const key = snapshotKey(snapshot);
    if (inflight.has(key)) return;
    inflight.add(key);
    try {
      const payload = await fetchAudioUrl(snapshot);
      cacheAudioUrl(snapshot, payload.url, payload.ttlSec);
    } catch {
      /* предзагрузка молчит */
    } finally {
      inflight.delete(key);
    }
  }

  async function ensureVideo(snapshot: VideoSnapshot): Promise<void> {
    if (getCachedStream(snapshot)?.kind === 'video') return;
    const key = snapshotKey(snapshot);
    if (inflight.has(key)) return;
    inflight.add(key);
    try {
      const payload = await fetchVideoStreams(snapshot);
      cacheVideoStreams(snapshot, payload.streams, payload.hls, payload.ttl_sec);
    } catch {
      /* предзагрузка молчит */
    } finally {
      inflight.delete(key);
    }
  }

  /** Клип-режим: следующий трек играет видео — матчим «трек → видео» заранее. */
  async function ensureClip(track: TrackSnapshot): Promise<void> {
    const key = snapshotKey(track);
    if (lastClipResolveKey === key && Date.now() - lastClipResolveAt < CLIP_RESOLVE_REUSE_MS) return;
    if (inflight.has(key)) return;
    inflight.add(key);
    try {
      const payload = await resolveVideo(track);
      lastClipResolveKey = key;
      lastClipResolveAt = Date.now();
      if (payload.video) await ensureVideo(payload.video);
    } catch {
      /* предзагрузка молчит */
    } finally {
      inflight.delete(key);
    }
  }

  function warm(): void {
    if (!auth.isAuthed || !player.isActiveDevice || !player.state.is_playing || online.isOnline === false) return;
    const { ahead, back } = player.adjacentSnapshots(AHEAD_COUNT, BACK_COUNT);
    const clipMode = player.clipMode;
    ahead.forEach((snapshot, index) => {
      if (snapshot.type === 'video') {
        void ensureVideo(snapshot);
        return;
      }
      void ensureAudio(snapshot);
      // Резолв тяжелее get-url: только ближайший трек и только в клип-режиме.
      if (clipMode && index === 0) void ensureClip(snapshot as TrackSnapshot);
    });
    for (const snapshot of back) {
      if (snapshot.type === 'video') void ensureVideo(snapshot);
      else void ensureAudio(snapshot);
    }
  }

  const keyOf = (snapshot: AnySnapshot | null) => (snapshot ? snapshotKey(snapshot) : null);

  watch(
    [
      // Смена трека и любое изменение виртуального потока (очередь/контекст/
      // repeat/shuffle): previewNext/previewPrevious пересчитываются движком.
      () => keyOf(player.state.current_snapshot),
      () => keyOf(player.previewNext),
      () => keyOf(player.previewPrevious),
      () => player.clipMode,
      () => player.isActiveDevice,
      () => player.state.is_playing,
      () => online.isOnline,
      () => auth.isAuthed,
    ],
    () => warm(),
    { immediate: true },
  );
}
