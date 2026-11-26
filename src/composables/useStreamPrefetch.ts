import { watch } from 'vue';
import { fetchAudioUrl } from '@/api/audio';
import { fetchVideoStreams, resolveVideo } from '@/api/videos';
import { cacheClipResolve, getCachedClipResolve } from '@/lib/clip-resolve-cache';
import { isUnmeteredConnection, warmHlsStart } from '@/lib/hls-warm';
import { snapshotKey } from '@/lib/playback-engine';
import { cacheAudioUrl, cacheVideoStreams, getCachedStream } from '@/lib/stream-url-cache';
import { useAuthStore } from '@/stores/auth';
import { useDownloadsStore } from '@/stores/downloads';
import { useOnlineStore } from '@/stores/online';
import { usePlayerStore } from '@/stores/player';
import type { AnySnapshot, TrackSnapshot, VideoSnapshot } from '@/types';

/**
 * Предзагрузка stream URL (frontend.md §9): устройство воспроизведения греет
 * ссылки 2 трека вперёд и 2 назад (волна — та же схема: окно её контекста
 * движок берёт как обычный список). Греем ТОЛЬКО ссылки (get-url) — байты
 * не трогаем. Кеш по snapshotKey до TTL: тёплая — не просим, дохлая —
 * перезапрашиваем. Клип-режим: дополнительно резолвим 2 трека вперёд
 * (результат — в сессионный кеш резолва, движок стартует с него без сети),
 * греем get-url их видео и «стартовый набор» HLS (init + первые сегменты
 * выбранной ступени и аудиодорожки, lib/hls-warm.ts) — только по Wi-Fi.
 * Назад резолв и байты не греем: «назад» чаще рестартит текущий трек, а
 * повторный резолв уже игравшего дешёвый. Только активное устройство,
 * только онлайн, на паузе молчим. Ошибки глотаем: предзагрузка не тостит
 * и не ломает плеер.
 */

const AHEAD_COUNT = 2;
const BACK_COUNT = 2;

/** Летящие запросы: один ключ — один прогрев. */
const inflight = new Set<string>();
/** Прогретые стартовые наборы (манифест+качество): повтор на скипе не нужен. */
const warmedHls = new Set<string>();

export function useStreamPrefetch() {
  const player = usePlayerStore();
  const online = useOnlineStore();
  const auth = useAuthStore();

  async function ensureAudio(snapshot: AnySnapshot): Promise<void> {
    if (snapshot.type === 'track' && useDownloadsStore().isDownloaded(snapshot)) return;
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

  /** Клип-режим: следующие треки играют видео — матчим «трек → видео» заранее. */
  async function ensureClip(track: TrackSnapshot): Promise<void> {
    const cached = getCachedClipResolve(track);
    if (cached) {
      if (cached.video) {
        await ensureVideo(cached.video);
        await warmClipStart(track);
      }
      return;
    }
    const key = snapshotKey(track);
    if (inflight.has(key)) return;
    inflight.add(key);
    try {
      const payload = await resolveVideo(track);
      cacheClipResolve(track, payload.video, payload.streams);
      if (payload.video) {
        await ensureVideo(payload.video);
        await warmClipStart(track);
      }
    } catch {
      /* предзагрузка молчит */
    } finally {
      inflight.delete(key);
    }
  }

  /**
   * «Стартовый набор» HLS следующего клипа: после тёплых резолва и get-url
   * греем init + первые сегменты выбранной ступени и аудиодорожки — скип
   * попадает в кеш микросервиса/браузера. Только Wi-Fi: на LTE байты не тянем.
   */
  async function warmClipStart(track: TrackSnapshot): Promise<void> {
    if (!isUnmeteredConnection()) return;
    const resolved = getCachedClipResolve(track);
    if (!resolved?.video) return;
    const cached = getCachedStream(resolved.video);
    if (cached?.kind !== 'video' || !cached.hls) return;
    const key = `${cached.hls.manifest_url}|${player.clipQuality}`;
    if (warmedHls.has(key)) return;
    warmedHls.add(key);
    await warmHlsStart(cached.hls.manifest_url, player.clipQuality);
  }

  function warm(): void {
    if (!auth.isAuthed || !player.isActiveDevice || !player.state.is_playing || online.isOnline === false) return;
    const { ahead, back } = player.adjacentSnapshots(AHEAD_COUNT, BACK_COUNT);
    const clipMode = player.clipMode;
    ahead.forEach((snapshot) => {
      if (snapshot.type === 'video') {
        void ensureVideo(snapshot);
        return;
      }
      void ensureAudio(snapshot);
      // Резолв тяжелее get-url: только вперёд и только в клип-режиме.
      if (clipMode && snapshot.type === 'track') void ensureClip(snapshot);
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
