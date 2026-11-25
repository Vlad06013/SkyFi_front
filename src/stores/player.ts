import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import * as devicesApi from '@/api/devices';
import * as playerApi from '@/api/player';
import * as queueApi from '@/api/queue';
import * as waveApi from '@/api/wave';
import type { VideoHls, VideoStream } from '@/api/videos';
import type { ClipAudioTrack } from '@/lib/hls-engine';
import { fetchFavorites } from '@/api/favorites';
import { fetchContextPage, resolveContext } from '@/lib/context-resolver';
import {
  orderedContext,
  peekAdjacent,
  resolveNext,
  resolvePlayableNext,
  resolvePlayablePrevious,
  resolvePrevious,
  snapshotKey,
  SKIP_RESTART_AFTER,
  type EngineAction,
  type EngineContext,
  type NextReason,
} from '@/lib/playback-engine';
import { moveItem } from '@/lib/list-sort';
import { unlockMediaPlayback } from '@/lib/media-unlock';
import { clearPlayerCache, loadPlayerCache, savePlayerCache } from '@/lib/library-cache';
import { readPlayerDevicePrefs, writePlayerDevicePrefs } from '@/lib/player-prefs';
import { onRealtimeReconnect } from '@/realtime';
import { useAuthStore } from '@/stores/auth';
import { useDevicesStore } from '@/stores/devices';
import { useDownloadsStore } from '@/stores/downloads';
import { useOnlineStore } from '@/stores/online';
import { useToastStore } from '@/stores/toast';
import type { AnySnapshot, EchoFields, PlaySource, PlayerStatePayload, PlayerStateView, QueueItem, RepeatMode, TrackSnapshot, VideoSnapshot } from '@/types';

const repeatCycle: RepeatMode[] = ['off', 'all', 'one'];

/** Период репорта позиции с активного устройства (api.md §5, план §3). */
export const POSITION_REPORT_INTERVAL_MS = 10_000;

/** Пауза после последнего движения ползунка, через которую seek уходит на сервер. */
export const SEEK_COMMIT_DELAY_MS = 300;

export const usePlayerStore = defineStore('player', () => {
  const toast = useToastStore();

  // --- Состояние (источник истины — сервер; до ответа плеера нет)

  const state = ref<PlayerStateView>({
    id: 0,
    current_snapshot: null,
    position_seconds: 0,
    is_playing: false,
    repeat_mode: 'off',
    shuffle_enabled: false,
    version: 0,
    play_source: 'single',
    previous_play_source: 'single',
    previous_play_source_snapshot: null,
    context_ref: null,
    clips_enabled: false,
    shuffle_seed: null,
    position_updated_at: null,
    active_device_id: null,
    devices: [],
  });
  /** Серверный стейт уже применялся. До этого version-gate не работает. */
  let serverStateApplied = false;
  /** Пока кеш не поднят, пустой стартовый стейт в базу не пишем. */
  let persistReady = false;
  /** Чей кеш уже поднят: чужой стейт в памяти не записываем на нового пользователя. */
  let hydratedUserId: number | null = null;

  const expanded = ref(false);
  const clipMode = ref(false);
  const clipQuality = ref(720);
  /** Базовая лестница селекта; дополняется качествами из ответа /videos/get-url. */
  const clipQualityLadder = [360, 720, 1080];
  /** Потоки текущего видео — какие пункты селекта активны (api.md §8). */
  const clipStreams = ref<VideoStream[]>([]);
  /** HLS-адаптация текущего видео (api.md §8.1): null — прогрессив streams. */
  const clipHls = ref<VideoHls | null>(null);
  /** Высоты видео из HLS-манифеста — пункты селекта качества в HLS-режиме. */
  const clipHlsHeights = ref<number[]>([]);
  /** HLS: true — ABR с потолком clipQuality; false — фиксированное выбранное качество. */
  const clipHlsAuto = ref(true);
  /** Выбранная аудиодорожка (api.md §8.1): id из манифеста; null — default. */
  const clipAudioId = ref<string | null>(null);
  /** Дорожки текущего манифеста (присылает hls-движок); пусто — селектор не показываем. */
  const clipAudioTracks = ref<ClipAudioTrack[]>([]);
  const clipQualities = computed(() => {
    if (clipHlsHeights.value.length) return [...clipHlsHeights.value].sort((a, b) => b - a);
    const qualities = new Set([...clipQualityLadder, ...clipStreams.value.map((stream) => stream.quality)]);
    return [...qualities].sort((a, b) => b - a);
  });
  /**
   * Клип для текущего трека (режим клипов, api.md §8): видео из /videos/resolve.
   * Серверный current_snapshot не трогаем — клип локальная подмена потока,
   * очередь/волна/пульт продолжают работать с треком.
   */
  const clipVideo = ref<VideoSnapshot | null>(null);
  /** Ключ трека (snapshotKey), для которого резолвили клип — смена трека инвалидирует. */
  const clipTrackKey = ref<string | null>(null);
  const clipStatus = ref<'idle' | 'resolving' | 'ready' | 'unavailable'>('idle');
  /** Эффективное видео для видео-движка: чистое видео из выдачи или клип на треке. */
  const clipPlaybackVideo = computed<VideoSnapshot | null>(() => {
    const snap = current.value;
    if (snap?.type === 'video') return snap;
    if (snap && clipMode.value && clipVideo.value && clipTrackKey.value === snapshotKey(snap)) {
      return clipVideo.value;
    }
    return null;
  });
  /** Клип реально играет — аудио-движок молчит, позицию ведёт видео. */
  const clipActive = computed(() => clipPlaybackVideo.value !== null);
  /**
   * Эффективный снапшот воспроизведения: клип фактически подменяет трек —
   * движки и прогресс видят видео, очередь/волна/переходы — по-прежнему трек.
   * Позиция одна на оба снапшота: секунда N на клипе ≠ секунде N трека,
   * это осознанный компромисс (frontend.md §7).
   */
  const effectiveCurrent = computed<AnySnapshot | null>(() => clipPlaybackVideo.value ?? current.value);
  const volume = ref(72);

  /** Серверная очередь — источник истины (api.md §6). */
  const queue = ref<QueueItem[]>([]);
  const queueLoaded = ref(false);

  /** Материализованный контекст (plan-player.md §2); для волны — серверное окно. */
  const contextItems = ref<AnySnapshot[]>([]);
  /**
   * Ключ загруженного контекста: источник + ref. Смена плейлиста без смены
   * источника — тоже перезагрузка (null — ещё ни разу не резолвился).
   */
  let contextKeyLoaded: string | null = null;
  /** У пагинированного источника (поиск/плейлист) за краем загруженного есть ещё. */
  let contextHasMore = false;
  /** Следующая страница за краем контекста (номер с 1). */
  let contextNextPage = 2;
  /** Токен гонок контекста: применяет результат только последний запрос. */
  let contextToken = 0;

  // --- Роли и команды (api.md §1.6: эхо-поля всегда с uuid устройства)

  /** Сети нет: команды не шлём, играет это устройство. */
  function offlinePlayback() {
    return useOnlineStore().isOnline === false;
  }

  /** Офлайн звучит только файл из скачанного. Ссылка потока — это Яндекс, не наш бэкенд. */
  function offlinePlayable(snapshot: AnySnapshot) {
    return snapshot.type === 'track' && useDownloadsStore().isDownloaded(snapshot);
  }

  /** Активное устройство = источник истины воспроизведения (plan-player.md §5). */
  const isActiveDevice = computed(() => {
    if (offlinePlayback()) return true;
    const uuid = useDevicesStore().myDeviceUuid;
    return uuid != null && state.value.active_device_id === uuid;
  });

  const canCommand = computed(() => useAuthStore().isAuthed);

  function echo(): EchoFields | null {
    const origin = useDevicesStore().myDeviceUuid;
    return origin ? { origin_device_id: origin, command_id: crypto.randomUUID() } : null;
  }

  /** Текст ошибки сети/бэка для тоста. */
  function errorText(cause: unknown, fallback: string) {
    return cause instanceof Error ? cause.message : fallback;
  }

  async function resync() {
    if (offlinePlayback()) return;
    try {
      const payload = await playerApi.fetchPlayerState();
      // Слияние по владению (frontend.md §5): reconnect АКТИВНОГО устройства —
      // воспроизведение остаётся локальным, иначе позиция откатывалась бы к
      // последнему репорту. Пульт и холодный старт — полная подмена зеркала.
      const mine = useDevicesStore().myDeviceUuid;
      const stillActive = serverStateApplied && mine != null && payload.state?.active_device_id === mine;
      if (stillActive) applyServerStateMerged(payload);
      else applyServerState(payload, { force: true });
    } catch {
      /* resync — лучшее, что могли */
    }
  }

  /**
   * Reconnect активного устройства: координация (version, active_device_id,
   * очередь, контекст-указатели, presence) — из сервера; трек, позиция и
   * is_playing — локальные (мы истина воспроизведения, сервер отстаёт на
   * интервал репорта; команды пульта из мёртвой зоны догонятся следующими
   * ивентами — «последняя команда побеждает»).
   */
  function applyServerStateMerged(payload: PlayerStatePayload) {
    if (!payload?.state) return;
    state.value = {
      ...payload.state,
      current_snapshot: state.value.current_snapshot,
      position_seconds: state.value.position_seconds,
      position_updated_at: state.value.position_updated_at,
      is_playing: state.value.is_playing,
    };
    applyClipsEnabled(payload.state.clips_enabled);
    queue.value = sortQueue(payload.queue ?? []);
    queueLoaded.value = true;
    anchorPosition();
    void syncContextWithSource();
  }

  // --- Активное устройство: активация и авто-активация (api.md §4, plan-player.md §5)

  /**
   * Активация устройства (api.md §4). Ответ — полный стейт плеера: применяем
   * сразу, своё эхо playback.device.changed роутер глушит. Активное в стейте
   * переключаем оптимистично, при ошибке — откат.
   */
  async function activateDevice(deviceUuid: string): Promise<boolean> {
    const fields = echo();
    if (!fields) {
      toast.show('Устройство ещё не зарегистрировано', '', true);
      return false;
    }
    const prevActive = state.value.active_device_id;
    applyActiveDevice(deviceUuid);
    try {
      const payload = await devicesApi.activateDevice(deviceUuid, fields);
      applyServerState(payload, { force: true });
      return true;
    } catch (cause) {
      applyActiveDevice(prevActive);
      toast.show(errorText(cause, 'Не удалось переключить устройство'), '', true);
      return false;
    }
  }

  /**
   * Перед «играй здесь» (/play, resume): активное устройство могло умереть
   * без бродкаста — потерю presence бэк наружу не вещает (api.md §4/§17).
   * Освежаем стейт; онлайн-активного нет — активируемся сами, иначе
   * остаёмся пультом чужого активного устройства.
   */
  async function ensureActiveForPlayback() {
    const devices = useDevicesStore();
    if (!devices.myDeviceUuid) return;
    await resync();
    if (isActiveDevice.value) return;
    const active = state.value.active_device_id;
    const activeOnline =
      active != null && state.value.devices.some((device) => device.device_uuid === active);
    if (!activeOnline) await activateDevice(devices.myDeviceUuid);
  }

  /**
   * Сокет playback.device.changed/disconnected: активное устройство сменилось
   * вне команд плеера — патчим стейт, версию не трогаем (ближайший стейт
   * с бэка перезапишет). Аудио-движок отреагирует вотчером isActiveDevice.
   */
  function applyActiveDevice(deviceUuid: string | null) {
    if (state.value.active_device_id === deviceUuid) return;
    state.value = { ...state.value, active_device_id: deviceUuid };
  }

  // --- Применение состояния: ответ команды (force) → сокет (version-gate) →
  // --- reconnect (пульт — подмена, активное — слияние по владению)

  /**
   * Потолок доверия к `position_updated_at`: репорты идут раз в 10 с,
   * свежий штамп — это секунды доставки. Протухший штамп (бэк не штампует
   * при resume?) или кривые часы докида не дают — иначе слайдер прыгал бы.
   */
  const POSITION_STAMP_TRUST_S = 30;

  function anchorPosition() {
    let position = state.value.position_seconds;
    // Пульт экстраполирует от серверного замера (api.md §5): без докида
    // каждый позиционный репорт пересаживал бы якорь на округлённое значение
    // и слайдер дёргался бы раз в интервал репорта.
    if (state.value.is_playing && state.value.position_updated_at) {
      const measuredAt = Date.parse(state.value.position_updated_at);
      if (Number.isFinite(measuredAt)) {
        const elapsed = (Date.now() - measuredAt) / 1000;
        if (elapsed >= 0 && elapsed <= POSITION_STAMP_TRUST_S) position += elapsed;
      }
    }
    anchor.value = position;
    anchorAt = Date.now();
  }

  function applyServerState(payload: PlayerStatePayload, opts: { force?: boolean } = {}) {
    if (!payload?.state) return;
    // Версии монотонны (бэк-фикс 2026-11-25): устаревшие и дубли отсекаем.
    if (!opts.force && serverStateApplied && payload.state.version <= state.value.version) return;
    serverStateApplied = true;
    state.value = payload.state;
    applyClipsEnabled(payload.state.clips_enabled);
    // Сокет-репорты позиции несут ту же очередь — не пересоздаём массив,
    // чтобы список очереди не перерисовывался на каждый репорт.
    const nextQueue = sortQueue(payload.queue ?? []);
    if (!sameQueue(nextQueue, queue.value)) queue.value = nextQueue;
    queueLoaded.value = true;
    anchorPosition();
    // Автопауза выключена: код на месте, вызов не стартует.
    // reconcileBoot();
    void syncContextWithSource();
  }

  /** Очередь совпадает по содержимому: сокет-стейты тащат очередь каждый
   *  репорт новыми объектами — без сравнения список перерисовывался бы. */
  function sameQueue(a: QueueItem[], b: QueueItem[]): boolean {
    return (
      a.length === b.length &&
      a.every(
        (item, index) =>
          item.id === b[index].id && item.position === b[index].position && item.status === b[index].status,
      )
    );
  }

  /** Сокет-ивент playback.state.updated (эхо и дедуп уже отсеял роутер):
   *  пейлоад — тот же JSON, что GET /player (state + queue, api.md §17). */
  function applySocketState(payload: PlayerStatePayload) {
    applyServerState(payload);
  }

  // --- Контекст (resolver, plan-player.md §2/§7): favorites/uploads/волна —
  // --- одним запросом; search/playlist по context_ref постранично

  /** Ключ контекста из серверного стейта: источник + ref — указатель, не содержимое. */
  function contextKeyOf(source: PlaySource, ref: string | null) {
    return `${source}|${ref ?? ''}`;
  }

  async function syncContextWithSource() {
    const key = contextKeyOf(state.value.play_source, state.value.context_ref);
    if (key === contextKeyLoaded) return;
    const token = ++contextToken;
    contextKeyLoaded = key;
    try {
      const resolved = await resolveContext(
        {
          playSource: state.value.play_source,
          contextRef: state.value.context_ref,
          currentType: state.value.current_snapshot?.type ?? null,
        },
        state.value.current_snapshot,
      );
      if (token !== contextToken || contextKeyLoaded !== key) return;
      contextItems.value = resolved.items;
      contextHasMore = resolved.hasMore;
      contextNextPage = resolved.pages + 1;
    } catch {
      /* контекст догрузится со следующим переходом */
    }
  }

  /** Ивент playback.wave.updated: окно выросло — заменяем копию, воспроизведение не трогаем. */
  function invalidateWave() {
    if (state.value.play_source === 'wave') contextKeyLoaded = null;
    void syncContextWithSource();
  }

  /**
   * Вход в волну с главной. Окно уже на сервере; играем первый
   * непрослушанный (played=false). Прослушанное остаётся в списке —
   * вернуться к нему можно только вручную.
   */
  async function joinWave() {
    try {
      const window = await waveApi.fetchWaveWindow();
      const start = window.find((item) => !item.played);
      if (!start) return;
      await playSnapshot(waveApi.waveSnapshot(start), 'wave', {
        contextItems: window.map(waveApi.waveSnapshot),
      });
    } catch (cause) {
      toast.show(errorText(cause, 'Не удалось включить волну'), '', true);
    }
  }

  async function loadFavoritesContext(): Promise<AnySnapshot[]> {
    const key = contextKeyOf('favorites', null);
    if (contextKeyLoaded === key && contextItems.value.length) return contextItems.value;
    const token = ++contextToken;
    contextKeyLoaded = key;
    contextHasMore = false;
    contextNextPage = 2;
    try {
      const favorites = await fetchFavorites();
      if (token === contextToken && contextKeyLoaded === key) contextItems.value = favorites.tracks;
    } catch {
      /* fallback без списка — не страшно */
    }
    return contextItems.value;
  }

  // --- Движок переходов (lib/playback-engine.ts)

  function engineContext(): EngineContext {
    return {
      current: state.value.current_snapshot,
      playSource: state.value.play_source,
      previousSource: state.value.previous_play_source,
      previous: state.value.previous_play_source_snapshot,
      repeatMode: state.value.repeat_mode,
      shuffleEnabled: state.value.shuffle_enabled,
      seed:
        state.value.shuffle_seed ??
        `static:${useAuthStore().user?.id ?? 0}:${state.value.play_source}:${state.value.context_ref ?? ''}`,
      queuePending: queue.value
        .filter((item) => item.status === 'pending' && item.snapshot)
        .map((item) => item.snapshot as AnySnapshot),
      contextItems: contextItems.value,
    };
  }

  let transitioning = false;

  /**
   * Соседи виртуального потока для предзагрузки stream URL
   * (frontend.md §9): движок знает и очередь, и контекст, и волну.
   */
  function adjacentSnapshots(aheadCount: number, backCount: number) {
    return peekAdjacent(engineContext(), aheadCount, backCount);
  }

  /**
   * Догрузка страницы пагинированного контекста (поиск/плейлист), когда
   * движок уперся в край загруженного: без неё next за краем страницы
   * проваливался в fallback избранного, хотя контекст продолжается.
   */
  async function expandContextFor(action: EngineAction, reason: NextReason): Promise<EngineAction> {
    if (action.action !== 'fallback_favorites') return action;
    const source = state.value.play_source;
    if ((source !== 'search' && source !== 'playlist') || !contextHasMore) return action;
    try {
      const page = await fetchContextPage(
        {
          playSource: source,
          contextRef: state.value.context_ref,
          currentType: state.value.current_snapshot?.type ?? null,
        },
        contextNextPage,
      );
      if (!page || contextKeyLoaded !== contextKeyOf(source, state.value.context_ref)) return action;
      const known = new Set(contextItems.value.map((item) => snapshotKey(item)));
      const fresh = page.items.filter((item) => !known.has(snapshotKey(item)));
      contextItems.value = [...contextItems.value, ...fresh];
      contextHasMore = page.hasMore;
      contextNextPage += 1;
      if (!fresh.length) return action;
      return resolveNext(engineContext(), reason);
    } catch {
      return action;
    }
  }

  async function runAction(action: EngineAction) {
    switch (action.action) {
      case 'play':
        await playSnapshot(action.snapshot, action.playbackSource, { rollSeed: false });
        break;
      case 'restart':
        await restartTrack();
        break;
      case 'fallback_favorites': {
        const favorites = await loadFavoritesContext();
        if (favorites.length) await playSnapshot(favorites[0], 'favorites', { rollSeed: false });
        else toast.show('В избранном пусто', '', true);
        break;
      }
      case 'noop':
        break;
    }
  }

  /**
   * Сид следующей перемешки, когда текущая уже доиграна.
   * Превью и свайп читают один и тот же, в стейт он попадает только на переходе.
   */
  let nextShuffleSeed: string | null = null;

  /** Офлайн: шаффл только по скачанным этого списка. После последнего — новая перемешка. */
  function offlineNext(reason: 'manual' | 'ended'): EngineAction {
    const ctx = engineContext();
    const queued = ctx.queuePending.find((item) => offlinePlayable(item));
    if (reason !== 'ended' && queued) {
      nextShuffleSeed = null;
      return { action: 'play', snapshot: queued, playbackSource: 'queue' };
    }
    if (reason === 'ended' && ctx.repeatMode === 'one' && ctx.current) {
      nextShuffleSeed = null;
      return { action: 'restart' };
    }
    if (queued) {
      nextShuffleSeed = null;
      return { action: 'play', snapshot: queued, playbackSource: 'queue' };
    }
    const items = ctx.contextItems.filter((item) => offlinePlayable(item));
    const shuffle = ctx.shuffleEnabled && ctx.playSource !== 'wave';
    if (shuffle && items.length > 1 && ctx.current) {
      const order = orderedContext(items, true, ctx.seed);
      const index = order.findIndex((item) => snapshotKey(item) === snapshotKey(ctx.current!));
      if (index === order.length - 1) {
        if (!nextShuffleSeed) nextShuffleSeed = crypto.randomUUID();
        const fresh = orderedContext(items, true, nextShuffleSeed);
        const start =
          fresh.find((item) => snapshotKey(item) !== snapshotKey(ctx.current!)) ?? fresh[0];
        return { action: 'play', snapshot: start, playbackSource: ctx.playSource };
      }
    }
    nextShuffleSeed = null;
    return resolvePlayableNext(items, ctx.current, {
      shuffle,
      seed: ctx.seed,
      repeatMode: ctx.repeatMode,
      playSource: ctx.playSource,
      reason,
    });
  }

  function offlinePrevious(): EngineAction {
    const ctx = engineContext();
    return resolvePlayablePrevious(
      ctx.contextItems.filter((item) => offlinePlayable(item)),
      ctx.current,
      positionSeconds.value,
      {
        shuffle: ctx.shuffleEnabled && ctx.playSource !== 'wave',
        seed: ctx.seed,
        playSource: ctx.playSource,
      },
    );
  }

  function skipNext(reason: 'manual' | 'ended' = 'manual') {
    if (transitioning) return;
    cancelPendingSeek();
    transitioning = true;
    void (async () => {
      if (offlinePlayback()) {
        const action = offlineNext(reason);
        if (nextShuffleSeed) {
          state.value = { ...state.value, shuffle_seed: nextShuffleSeed };
          nextShuffleSeed = null;
        }
        await runAction(action);
        return;
      }
      const action = await expandContextFor(resolveNext(engineContext(), reason), reason);
      await runAction(action);
    })().finally(() => {
      transitioning = false;
    });
  }

  /** Автопереход по `ended` с аудио-элемента. */
  function handleTrackEnded() {
    skipNext('ended');
  }

  async function skipPrevious() {
    if (transitioning) return;
    cancelPendingSeek();
    transitioning = true;
    void runAction(offlinePlayback() ? offlinePrevious() : resolvePrevious(engineContext(), positionSeconds.value)).finally(() => {
      transitioning = false;
    });
  }

  /** Рестарт текущего трека: позиция 0, воспроизведение продолжается. */
  async function restartTrack() {
    cancelPendingSeek();
    state.value = {
      ...state.value,
      position_seconds: 0,
      is_playing: true,
      position_updated_at: new Date().toISOString(),
    };
    anchorPosition();
    // Серверная позиция часто ещё 0, а элемент уже ушёл вперёд — вотч по
    // position_seconds тогда не стреляет, и сброс не доходит до звука.
    mediaSeek.value += 1;
    if (!canCommand.value || offlinePlayback()) return;
    const fields = echo();
    if (!fields) return;
    try {
      applyServerState(await playerApi.seekTo(0, fields), { force: true });
    } catch (cause) {
      toast.show(errorText(cause, 'Не удалось перезапустить трек'), '', true);
    }
  }

  /**
   * context_ref для /play (api.md §5): явный из вызова побеждает; search/
   * playlist без явного сохраняют серверный — переходы движка и next пульта
   * идут внутри того же контекста, указатель стирать нельзя (пульт = зеркало,
   * не источник контекста); queue ref не трогает (в очереди живёт прежний
   * контекст возврата); остальные источники шлют null — их ref всегда null.
   */
  function playContextRef(playbackSource: PlaySource, explicit: string | null | undefined): string | null | undefined {
    if (explicit !== undefined) return explicit;
    if (playbackSource === 'queue') return undefined;
    if (playbackSource === 'search' || playbackSource === 'playlist') return state.value.context_ref;
    return null;
  }

  /**
   * Прямой запуск (api.md §5). Пользовательский тап — rollSeed: ролл сида
   * детерминированного shuffle; переходы движка ключ не трогают. Тап из
   * списка передаёт contextItems — движок строит переходы сразу, без
   * ожидания resolver (plan-player.md §2).
   */
  async function playSnapshot(
    snapshot: AnySnapshot,
    playbackSource: PlaySource = 'single',
    opts: { rollSeed?: boolean; contextItems?: AnySnapshot[]; contextRef?: string | null } = {},
  ) {
    // До await: жест тапа ещё жив, иначе play() после get-url браузер глушит.
    unlockMediaPlayback();
    if (offlinePlayback() && !offlinePlayable(snapshot)) return;
    cancelPendingSeek();
    dropFromQueue(snapshotId(snapshot));
    const contextRef = playContextRef(playbackSource, opts.contextRef);
    if (opts.contextItems) {
      contextItems.value = opts.contextItems;
      contextKeyLoaded = contextRef === undefined ? null : contextKeyOf(playbackSource, contextRef);
      contextHasMore = false;
      contextNextPage = 2;
    }
    if (!canCommand.value || offlinePlayback()) {
      state.value = {
        ...state.value,
        current_snapshot: snapshot,
        position_seconds: 0,
        is_playing: true,
        play_source: playbackSource,
        position_updated_at: new Date().toISOString(),
      };
      anchorPosition();
      return;
    }
    const fields = echo();
    if (!fields) {
      toast.show('Устройство ещё не зарегистрировано', '', true);
      return;
    }
    // «Играть будет это устройство»: без онлайн-активного активируемся сами.
    if (!isActiveDevice.value) await ensureActiveForPlayback();
    try {
      const extra: { context_ref?: string | null; shuffle_seed?: string | null } = {
        shuffle_seed: opts.rollSeed === false ? undefined : crypto.randomUUID(),
      };
      if (contextRef !== undefined) extra.context_ref = contextRef;
      const payload = await playerApi.playSnapshot(snapshot, playbackSource, fields, extra);
      applyServerState(payload, { force: true });
    } catch (cause) {
      toast.show(errorText(cause, 'Не удалось включить'), '', true);
      void resync();
    }
  }

  /**
   * Тап по строке списка (единое поведение списков): текущий снапшот —
   * пауза/плей (togglePlay: при рассинхроне пинает элемент), иной — прямой
   * запуск. Совпадение по snapshotKey, а не по идентичности объектов.
   */
  async function playOrToggle(
    snapshot: AnySnapshot,
    playbackSource: PlaySource = 'single',
    opts: { rollSeed?: boolean; contextItems?: AnySnapshot[]; contextRef?: string | null } = {},
  ) {
    const current = state.value.current_snapshot;
    if (current && snapshotKey(current) === snapshotKey(snapshot)) {
      await togglePlay();
      return;
    }
    await playSnapshot(snapshot, playbackSource, opts);
  }

  /** Второй toggle в тот же клик (кнопка паузы в клипе сносит иконку, клик проваливается на экран). */
  let lastToggleAt = 0;

  async function togglePlay() {
    const now = Date.now();
    if (now - lastToggleAt < 400) return;
    lastToggleAt = now;
    if (offlinePlayback()) {
      unlockMediaPlayback();
      if (state.value.is_playing && !audioPlaying.value) {
        kickEngine();
        return;
      }
      state.value = {
        ...state.value,
        is_playing: !state.value.is_playing,
        position_updated_at: new Date().toISOString(),
      };
      anchorPosition();
      return;
    }
    if (!canCommand.value) {
      state.value = {
        ...state.value,
        is_playing: !state.value.is_playing,
        position_updated_at: new Date().toISOString(),
      };
      anchorPosition();
      return;
    }
    const fields = echo();
    if (!fields) {
      toast.show('Устройство ещё не зарегистрировано', '', true);
      return;
    }
    const wasPlaying = state.value.is_playing;
    // Рассинхрон после загрузки страницы/сбоя потока: сервер уверен, что
    // играем, а элемент активного устройства молчит (автоплей отклонён,
    // ссылка протухла). Обычный toggle дал бы паузу — и второй тап (resume)
    // не помог бы: is_playing не меняется, вотчеры элемент не пинают.
    // Пинаем движок напрямую, сервер не трогаем.
    if (wasPlaying && isActiveDevice.value && !audioPlaying.value) {
      unlockMediaPlayback();
      kickEngine();
      return;
    }
    if (!wasPlaying) {
      unlockMediaPlayback();
      // Resume = «играть здесь»: без онлайн-активного активируемся сами.
      if (!isActiveDevice.value) {
        await ensureActiveForPlayback();
        // Пока освежали стейт, играть могло начаться (сокет, другой тап) —
        // цель достигнута, паузу вслед не шлём.
        if (state.value.is_playing) return;
      }
    }
    // Оптимистично, с откатом по ошибке (plan-player.md §5). Пауза сама
    // увозит позицию — висящий seek отменяем, чтобы не дёргать бэк дважды.
    if (wasPlaying) cancelPendingSeek();
    state.value = {
      ...state.value,
      is_playing: !wasPlaying,
      position_updated_at: new Date().toISOString(),
    };
    anchorPosition();
    try {
      const payload = wasPlaying
        ? await playerApi.pausePlayback(fields, Math.round(extrapolatedPosition.value))
        : await playerApi.resumePlayback(fields);
      applyServerState(payload, { force: true });
    } catch (cause) {
      state.value = {
        ...state.value,
        is_playing: wasPlaying,
        position_updated_at: new Date().toISOString(),
      };
      anchorPosition();
      toast.show(errorText(cause, 'Не удалось переключить воспроизведение'), '', true);
      void resync();
    }
  }

  async function toggleRepeat() {
    const index = repeatCycle.indexOf(state.value.repeat_mode);
    const next = repeatCycle[(index + 1) % repeatCycle.length];
    if (!canCommand.value || offlinePlayback()) {
      state.value = { ...state.value, repeat_mode: next };
      return;
    }
    const fields = echo();
    if (!fields) return;
    try {
      applyServerState(await playerApi.patchPlaybackOptions({ repeat_mode: next }, fields), { force: true });
    } catch (cause) {
      toast.show(errorText(cause, 'Не удалось сменить повтор'), '', true);
    }
  }

  async function toggleShuffle() {
    const next = !state.value.shuffle_enabled;
    if (!canCommand.value || offlinePlayback()) {
      state.value = {
        ...state.value,
        shuffle_enabled: next,
        shuffle_seed: next ? crypto.randomUUID() : null,
      };
      return;
    }
    const fields = echo();
    if (!fields) return;
    // Включение — ролл ключа («перемешать заново»); выключение — seed: null (plan-player.md §2).
    try {
      applyServerState(await playerApi.patchPlaybackOptions({ shuffle_enabled: next }, fields, next ? crypto.randomUUID() : null), {
        force: true,
      });
    } catch (cause) {
      toast.show(errorText(cause, 'Не удалось переключить shuffle'), '', true);
    }
  }

  // --- Позиция: экстраполяция от якоря (пульты и активное устройство без аудио)

  const anchor = ref(state.value.position_seconds);
  let anchorAt = Date.now();
  /** 1-секундный тикер: двигает экстраполированную позицию и шлёт периодический репорт. */
  const nowTick = ref(Date.now());
  let positionTimer: ReturnType<typeof setInterval> | null = null;

  function startPositionTicker() {
    stopPositionTicker();
    positionTimer = setInterval(() => {
      nowTick.value = Date.now();
      if (canCommand.value && isActiveDevice.value && state.value.is_playing && !offlinePlayback()) {
        void reportPosition();
      }
    }, 1000);
  }

  function stopPositionTicker() {
    if (positionTimer) {
      clearInterval(positionTimer);
      positionTimer = null;
    }
  }

  /** Периодический репорт позиции — намеренно бродкастит пультам (сверка А, 2026-11-23). */
  let lastReportAt = 0;

  async function reportPosition() {
    const now = Date.now();
    if (now - lastReportAt < POSITION_REPORT_INTERVAL_MS) return;
    const seconds = Math.round(extrapolatedPosition.value);
    if (Math.abs(seconds - state.value.position_seconds) < 3) return;
    lastReportAt = now;
    const fields = echo();
    if (!fields) return;
    try {
      applyServerState(await playerApi.seekTo(seconds, fields), { force: true });
    } catch {
      /* следующий тик повторит */
    }
  }

  /** Аудио-элемент активного устройства реально звучит (метит композабл по событиям). */
  const audioPlaying = ref(false);
  /**
   * Пинок движку: элемент должен реально заиграть. Счётчик, а не колбэк —
   * движки (аудио/видео) сами решают, кто из них текущий, по своим вотчерам.
   */
  const engineKick = ref(0);

  function setAudioPlaying(playing: boolean) {
    audioPlaying.value = playing;
  }

  function kickEngine() {
    engineKick.value += 1;
  }

  /** Текущий движок грузит поток/резолвит клип — реконсиляцию-паузу держим, пока грузится. */
  const engineLoading = ref(false);

  function setEngineLoading(loading: boolean) {
    engineLoading.value = loading;
  }

  /**
   * Движок применил поток и ждёт, пока элемент реально заиграет (`playing`).
   * canplay для холодного HLS врёт: буфер на один кадр есть, а сегмент с
   * origin ещё десятки секунд — это ожидание, не рассинхрон. Пока греемся,
   * реконсиляция «честной паузы» молчит, иначе resume тут же добивается паузой.
   */
  const streamWarming = ref(false);

  function setStreamWarming(warming: boolean) {
    streamWarming.value = warming;
  }

  /** Трек ещё без звука: качается ссылка или поток. Клип сюда не входит. */
  const audioLoading = computed(
    () =>
      !clipActive.value &&
      current.value?.type === 'track' &&
      state.value.is_playing &&
      (engineLoading.value || streamWarming.value),
  );

  // --- Подмена значка: фактическое воспроизведение против мнения сервера

  /**
   * Рассинхрон: сервер уверен, что играем, а элемент активного устройства
   * молчит (после загрузки страницы автоплей отклонён, протухший поток).
   * Пульт и гости зеркалят сервер — им верить нечему.
   */
  const playbackDesynced = computed(
    () =>
      state.value.is_playing &&
      !!state.value.current_snapshot &&
      canCommand.value &&
      isActiveDevice.value &&
      !audioPlaying.value,
  );
  /** Мгновенная подмена мелькает на переходах (подгрузка потока ~секунду). */
  const DESYNC_GRACE_MS = 1_500;
  /** Рассинхрон дольше грейса — показываем паузу честно. */
  const desyncGracePassed = ref(false);
  let desyncTimer: ReturnType<typeof setTimeout> | null = null;
  watch(playbackDesynced, (desynced) => {
    if (desyncTimer) {
      clearTimeout(desyncTimer);
      desyncTimer = null;
    }
    if (!desynced) {
      desyncGracePassed.value = false;
      return;
    }
    desyncTimer = setTimeout(() => {
      desyncTimer = null;
      desyncGracePassed.value = true;
    }, DESYNC_GRACE_MS);
  });

  /** Реальная пауза с текущей позицией — реконсиляция рассинхрона. */
  function pauseToServer() {
    const fields = echo();
    if (!fields) return;
    void playerApi
      .pausePlayback(fields, Math.round(extrapolatedPosition.value))
      .then((payload) => applyServerState(payload, { force: true }))
      .catch(() => {
        /* следующий виток догонит */
      });
  }

  /**
   * Одноразовая реконсиляция загрузки: свежая страница сама не играет
   * (автоплей без жеста отклонён — в WebView APK всегда), а сервер присылает
   * `is_playing=true` с прошлой сессии. Вместо секунд притворства шлём сразу
   * честную паузу — сервер и пульты сразу знают правду. Одноразово: дальше
   * застрявший рассинхрон добирает обычная реконсиляция.
   */
  let bootPauseSent = false;

  function reconcileBoot() {
    if (bootPauseSent) return;
    bootPauseSent = true;
    if (!isActiveDevice.value || !canCommand.value || !state.value.is_playing) return;
    pauseToServer();
  }

  /**
   * Реконсиляция с сервером: это активное устройство, сервер уверен, что
   * играем, а элемент молчит и поток не грузится — значит воспроизведения
   * нет (автоплей отклонён при загрузке, протухший поток). Шлём реальную
   * паузу, чтобы сервер и пульты узнали правду, а не местную подмену значка.
   */
  const DESYNC_CONFIRM_MS = 3_000;
  let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  watch([playbackDesynced, engineLoading, streamWarming], ([desynced, loading, warming]) => {
    if (reconcileTimer) {
      clearTimeout(reconcileTimer);
      reconcileTimer = null;
    }
    if (!desynced || loading || warming) return;
    reconcileTimer = setTimeout(() => {
      reconcileTimer = null;
      // К тику всё могло переиграться (медленный буфер, тап) — перепроверяем.
      if (!playbackDesynced.value || engineLoading.value || streamWarming.value) return;
      // Автопауза выключена: код на месте, вызов не стартует.
      // pauseToServer();
    }, DESYNC_CONFIRM_MS);
  });

  /** Фактическое воспроизведение для UI: иконка плея, эквалайзер, анимации. */
  const isPlaying = computed(() => {
    if (!state.value.is_playing) return false;
    if (!playbackDesynced.value) return true;
    return !desyncGracePassed.value;
  });

  const extrapolatedPosition = computed(() => {
    if (!state.value.is_playing) return anchor.value;
    // Активное устройство: позиция идёт только когда звук реально идёт.
    // Пока качается ссылка или ждём первый кадр, ползунок стоит — иначе
    // полоска растёт на обложке со спиннером.
    if (
      isActiveDevice.value &&
      (!audioPlaying.value || engineLoading.value || streamWarming.value)
    ) {
      return anchor.value;
    }
    return anchor.value + (nowTick.value - anchorAt) / 1000;
  });

  /** Актуальная позиция из аудио-элемента: переустанавливает якорь экстраполяции. */
  function anchorFromAudio(seconds: number) {
    anchor.value = seconds;
    anchorAt = Date.now();
  }

  /** Экстраполированная позиция в секундах — для ползунка, времён и синхротекста. */
  const positionSeconds = computed(() => Math.max(0, extrapolatedPosition.value));

  // --- Очередь (api.md §6)

  function sortQueue(items: QueueItem[]): QueueItem[] {
    return [...items].sort((a, b) => a.position - b.position);
  }

  /** Ленивый первичный GET очереди: стор живёт и без авторизации, поэтому не в конструкторе. */
  async function ensureQueue() {
    if (queueLoaded.value) return;
    await refreshQueue();
  }

  /** Форс-рефетч очереди (сокеты playback.queue.updated / friend.queue.item.added). */
  async function refreshQueue() {
    if (offlinePlayback()) return;
    try {
      queue.value = sortQueue(await queueApi.fetchQueue());
      queueLoaded.value = true;
    } catch {
      /* очередь догрузится при следующем открытии */
    }
  }

  /** Добавление в конец очереди. true — сервер принял. */
  async function enqueueSnapshot(snapshot: AnySnapshot): Promise<boolean> {
    try {
      queue.value = sortQueue(await queueApi.addToQueue(snapshot));
      return true;
    } catch (cause) {
      toast.show(errorText(cause, 'Не удалось добавить в очередь'), '', true);
      return false;
    }
  }

  async function removeQueueItem(id: number) {
    try {
      queue.value = sortQueue(await queueApi.removeFromQueue(id));
    } catch (cause) {
      toast.show(errorText(cause, 'Не удалось убрать из очереди'), '', true);
    }
  }

  /** Перестановка по индексам: бэку уходит список id ожидающих элементов в новом порядке. */
  async function reorderQueue(from: number, to: number) {
    if (from === to) return;
    const items = moveItem(queue.value, from, to).map((item) => item.id);
    try {
      queue.value = sortQueue(await queueApi.reorderPending(items));
    } catch (cause) {
      toast.show(errorText(cause, 'Не удалось изменить порядок'), '', true);
    }
  }

  function snapshotId(snapshot: AnySnapshot | null | undefined) {
    return snapshot && 'source_id' in snapshot ? snapshot.source_id : null;
  }

  function dropFromQueue(sourceId: string | null) {
    if (!sourceId) return;
    if (queue.value.some((item) => item.snapshot?.source_id === sourceId)) {
      queue.value = queue.value.filter((item) => item.snapshot?.source_id !== sourceId);
    }
  }

  // --- Производные для UI

  const current = computed(() => state.value.current_snapshot);

  // Громкость живёт в Preferences, как история поиска. Режим клипов больше
  // здесь не храним: серверный clips_enabled — источник истины, устройства
  // иначе расходились бы в режиме (на одном видео, на другом аудио).
  let prefsHydrating = true;
  let volumeTouched = false;
  let prefsTimer: ReturnType<typeof setTimeout> | null = null;

  function rememberPlayerPrefs() {
    if (prefsHydrating) return;
    if (prefsTimer) clearTimeout(prefsTimer);
    prefsTimer = setTimeout(() => {
      prefsTimer = null;
      void writePlayerDevicePrefs({ volume: volume.value });
    }, 200);
  }

  watch(volume, rememberPlayerPrefs);

  void readPlayerDevicePrefs().then((saved) => {
    if (saved && !volumeTouched) volume.value = saved.volume;
    prefsHydrating = false;
    if (volumeTouched) rememberPlayerPrefs();
  });
  const title = computed(() => current.value?.title ?? '');
  const artist = computed(() =>
    current.value?.artists.map((a) => a.name).join(', ') ?? '',
  );
  const previewNext = computed<AnySnapshot | null>(() => {
    const action = offlinePlayback() ? offlineNext('manual') : resolveNext(engineContext(), 'manual');
    return action.action === 'play' ? action.snapshot : null;
  });
  const previewPrevious = computed<AnySnapshot | null>(() => {
    const action = offlinePlayback()
      ? offlinePrevious()
      : resolvePrevious(engineContext(), SKIP_RESTART_AFTER);
    return action.action === 'play' ? action.snapshot : null;
  });
  const album = computed(() => {
    const snap = current.value;
    if (snap?.type === 'track') return snap.album?.title ?? '';
    return '';
  });
  const durationSeconds = computed(() => {
    // Длительность эффективного снапшота: в клип-режиме ползунок живёт
    // по длительности клипа, а не трека.
    const snap = effectiveCurrent.value;
    if (snap && (snap.type === 'track' || snap.type === 'video')) {
      return (snap.duration_ms ?? 0) / 1000;
    }
    return 0;
  });
  const progress = computed(() => {
    const duration = durationSeconds.value;
    if (!duration) return 0;
    return Math.min(100, (extrapolatedPosition.value / duration) * 100);
  });
  /**
   * Плавное заполнение только на тике воспроизведения (~1 с).
   * Сброс в 0, старт с позиции и seek — сразу, без доезда.
   */
  const progressSmooth = ref(false);
  watch(progress, (next, prev) => {
    const step = next - (prev ?? 0);
    const duration = durationSeconds.value;
    const tickPct = duration > 0 ? (1.5 / duration) * 100 : 0;
    // Пульт звука не имеет, но зеркало играет — ползунок тоже ползёт плавно.
    const sounding = audioPlaying.value || (!isActiveDevice.value && canCommand.value);
    const flowing = isPlaying.value && sounding && !engineLoading.value && !streamWarming.value;
    progressSmooth.value = flowing && step > 0 && step <= tickPct;
  });

  // --- Seek: локально сразу, на сервер — одним запросом после остановки драга

  let seekCommitTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSeekSeconds: number | null = null;
  /** Принудительный seek элемента, даже если серверные секунды не изменились. */
  const mediaSeek = ref(0);

  function cancelPendingSeek() {
    if (seekCommitTimer) {
      clearTimeout(seekCommitTimer);
      seekCommitTimer = null;
    }
    pendingSeekSeconds = null;
  }

  function commitSeek() {
    seekCommitTimer = null;
    if (pendingSeekSeconds == null) return;
    // Бэк принимает только целые секунды (api.md §5).
    const seconds = Math.round(pendingSeekSeconds);
    pendingSeekSeconds = null;
    if (!canCommand.value || offlinePlayback()) return;
    const fields = echo();
    if (!fields) return;
    void playerApi.seekTo(seconds, fields).catch((cause) => {
      toast.show(errorText(cause, 'Не удалось перемотать'), '', true);
    });
  }

  function seek(seconds: number) {
    const max = durationSeconds.value;
    if (!max) return;
    state.value = {
      ...state.value,
      position_seconds: Math.min(max, Math.max(0, seconds)),
      position_updated_at: new Date().toISOString(),
    };
    anchorPosition();
    // Драг шлёт десятки событий в секунду — на сервер уходит только последняя
    // позиция, через короткую паузу после отпускания. Пульт тоже шлёт seek —
    // бэк вещает команду на активное устройство.
    if (!canCommand.value) return;
    pendingSeekSeconds = state.value.position_seconds;
    if (seekCommitTimer) clearTimeout(seekCommitTimer);
    seekCommitTimer = setTimeout(commitSeek, SEEK_COMMIT_DELAY_MS);
  }

  function seekRatio(ratio: number) {
    seek(ratio * durationSeconds.value);
  }

  // --- Режим клипов (api.md §8): серверный флаг clips_enabled — все
  // --- устройства играют в одном режиме (PATCH /options, бродкаст).
  // --- Локальный clipMode — зеркало флага; движки и UI следят за ним.

  /** Зеркало clips_enabled из применённого серверного стейта. */
  function applyClipsEnabled(enabled: boolean) {
    if (clipMode.value === enabled) return;
    clipMode.value = enabled;
    if (!enabled) clearClip();
  }

  async function toggleClips() {
    if (!canCommand.value || offlinePlayback()) {
      // Мок-режим и офлайн: сервера нет — тоглим локально, движок следит за clipMode.
      if (clipMode.value) {
        clipMode.value = false;
        clearClip();
      } else {
        clipMode.value = true;
      }
      state.value = { ...state.value, clips_enabled: clipMode.value };
      return;
    }
    const fields = echo();
    if (!fields) {
      toast.show('Устройство ещё не зарегистрировано', '', true);
      return;
    }
    const next = !clipMode.value;
    const prev = clipMode.value;
    // Оптимистично, с откатом: движок начинает резолв клипа сразу, без
    // ожидания ответа (пульт увидит бродкастом).
    clipMode.value = next;
    if (!next) clearClip();
    try {
      applyServerState(await playerApi.patchPlaybackOptions({ clips_enabled: next }, fields), { force: true });
    } catch (cause) {
      clipMode.value = prev;
      if (!prev) clearClip();
      toast.show(errorText(cause, 'Не удалось переключить режим клипов'), '', true);
      void resync();
    }
  }

  function setClipResolving() {
    clipStatus.value = 'resolving';
  }

  /** Резолв приехал: клип закрепляется за треком. hls в resolve нет (api.md §8) —
   *  стартуем на прогрессиве, манифест добирает движок ближайшим get-url. */
  function setClipResolved(track: TrackSnapshot, video: VideoSnapshot, streams: VideoStream[]) {
    clipTrackKey.value = snapshotKey(track);
    clipVideo.value = video;
    clipStatus.value = 'ready';
    clipAudioId.value = null;
    clipHlsAuto.value = true;
    setClipStreams(streams);
    setClipHls(null);
  }

  /** Клипа нет (video: null) или резолв упал — остаёмся на аудио, индикатор в плеере. */
  function setClipUnavailable() {
    clipVideo.value = null;
    clipTrackKey.value = null;
    clipStatus.value = 'unavailable';
    clearClipPlayback();
  }

  function clearClip() {
    clipVideo.value = null;
    clipTrackKey.value = null;
    clipStatus.value = 'idle';
    clearClipPlayback();
  }

  /** Общая зачистка локальных потоков клипа: streams/HLS/дорожки/высоты. */
  function clearClipPlayback() {
    clipStreams.value = [];
    clipHls.value = null;
    clipHlsHeights.value = [];
    clipAudioId.value = null;
    clipAudioTracks.value = [];
  }

  // Смена трека инвалидирует клип: движок резолвит заново, пока режим включён.
  watch(
    () => (current.value ? snapshotKey(current.value) : null),
    (key) => {
      if (key !== clipTrackKey.value) clearClip();
    },
  );

  function setClipQuality(quality: number) {
    clipHlsAuto.value = false;
    clipQuality.value = quality;
  }

  /** HLS-режим: вернуться к ABR (потолок — clipQuality), выбор ручника отменяется. */
  function setClipQualityAuto() {
    clipHlsAuto.value = true;
  }

  /** Потоки видео. Выбор качества здесь не трогаем: у YouTube прогрессив-список —
   *  один 360p и не описывает HLS-лесенку (кламп по списку — clampClipQualityToStreams). */
  function setClipStreams(streams: VideoStream[]) {
    clipStreams.value = streams;
  }

  /** Прогрессив-режим (get-url без hls): выбранное качество вне списка потоков → максимум из списка. */
  function clampClipQualityToStreams() {
    const qualities = clipStreams.value.map((stream) => stream.quality);
    if (qualities.length && !qualities.includes(clipQuality.value)) {
      clipQuality.value = Math.max(...qualities);
    }
  }

  /** HLS-адаптация: сменился манифест — высоты и дорожки устарели, ждём свежие из него. */
  function setClipHls(hls: VideoHls | null) {
    if (clipHls.value?.manifest_url !== hls?.manifest_url) {
      clipHlsHeights.value = [];
      clipAudioTracks.value = [];
      if (clipAudioId.value != null) clipAudioId.value = null;
    }
    clipHls.value = hls;
  }

  /** Высоты из разобранного манифеста: пункты селекта; выбор недоступен → максимум. */
  function setClipHlsHeights(heights: number[]) {
    const sorted = [...new Set(heights)].sort((a, b) => b - a);
    clipHlsHeights.value = sorted;
    if (sorted.length && !sorted.includes(clipQuality.value)) clipQuality.value = sorted[0];
  }

  /** Дорожки из разобранного манифеста; выбранная не доехала — сброс на default. */
  function setClipAudioTracks(tracks: ClipAudioTrack[]) {
    clipAudioTracks.value = tracks;
    if (clipAudioId.value != null && !tracks.some((track) => track.id === clipAudioId.value)) {
      clipAudioId.value = null;
    }
  }

  /** Выбор аудиодорожки (дубляж): id из манифеста; null — default. */
  function setClipAudioId(id: string | null) {
    clipAudioId.value = id;
  }

  function openExpanded() {
    if (current.value) expanded.value = true;
  }

  function closeExpanded() {
    expanded.value = false;
  }

  function setVolume(percent: number) {
    volumeTouched = true;
    volume.value = Math.round(Math.min(100, Math.max(0, percent)));
  }

  // --- Жизненный цикл: старт/реконнект (plan-player.md §5)

  let unbindReconnect: (() => void) | null = null;

  /** Первичная загрузка состояния и рефетч на reconnect (полная подмена зеркала). */
  function persistPlayer() {
    if (!persistReady) return;
    const userId = useAuthStore().user?.id;
    if (!userId) return;
    if (!serverStateApplied && hydratedUserId !== userId) return;
    void savePlayerCache(userId, {
      state: state.value,
      queue: queue.value,
      contextItems: contextItems.value,
    });
  }

  watch([state, queue, contextItems], () => persistPlayer());

  /** Последняя копия до ответа сервера. Холодный GET /player её заменяет. */
  async function hydratePlayer(userId: number) {
    const row = await loadPlayerCache(userId);
    if (!row?.state || serverStateApplied || useAuthStore().user?.id !== userId) return;
    state.value = row.state;
    queue.value = sortQueue(row.queue ?? []);
    queueLoaded.value = true;
    contextItems.value = row.contextItems ?? [];
    contextKeyLoaded = contextKeyOf(row.state.play_source, row.state.context_ref);
    hydratedUserId = userId;
    anchorPosition();
  }

  function bindServerPlayback() {
    startPositionTicker();
    const auth = useAuthStore();
    watch(
      () => [auth.isAuthed, useOnlineStore().isOnline] as const,
      ([authed, online]) => {
        if (authed) {
          unbindReconnect ??= onRealtimeReconnect(() => {
            void refreshQueue();
            void resync();
          });
          const userId = auth.user?.id;
          void (async () => {
            if (userId) await hydratePlayer(userId);
            if (!useAuthStore().isAuthed) return;
            persistReady = true;
            if (online !== true) return;
            void refreshQueue();
            void resync();
          })();
        } else {
          persistReady = false;
          hydratedUserId = null;
          serverStateApplied = false;
          void clearPlayerCache();
          unbindReconnect?.();
          unbindReconnect = null;
        }
      },
      { immediate: true },
    );
  }

  return {
    state,
    expanded,
    clipMode,
    clipQuality,
    clipQualities,
    clipStreams,
    clipHls,
    clipHlsHeights,
    clipHlsAuto,
    clipAudioId,
    clipAudioTracks,
    clipVideo,
    clipTrackKey,
    clipStatus,
    clipPlaybackVideo,
    clipActive,
    setClipStreams,
    clampClipQualityToStreams,
    setClipHls,
    setClipHlsHeights,
    setClipAudioTracks,
    setClipAudioId,
    setClipQualityAuto,
    setClipResolving,
    setClipResolved,
    setClipUnavailable,
    clearClip,
    volume,
    queue,
    queueLoaded,
    isActiveDevice,
    current,
    effectiveCurrent,
    title,
    artist,
    previewNext,
    previewPrevious,
    skipRestartAfter: SKIP_RESTART_AFTER,
    album,
    durationSeconds,
    progress,
    progressSmooth,
    mediaSeek,
    positionSeconds,
    audioPlaying,
    engineKick,
    engineLoading,
    streamWarming,
    audioLoading,
    isPlaying,
    setAudioPlaying,
    setEngineLoading,
    setStreamWarming,
    anchorFromAudio,
    togglePlay,
    toggleShuffle,
    toggleRepeat,
    playSnapshot,
    playOrToggle,
    ensureQueue,
    refreshQueue,
    enqueueSnapshot,
    removeQueueItem,
    reorderQueue,
    skipNext: () => skipNext('manual'),
    skipPrevious,
    adjacentSnapshots,
    handleTrackEnded,
    seek,
    seekRatio,
    toggleClips,
    setClipQuality,
    openExpanded,
    closeExpanded,
    setVolume,
    applyServerState,
    applySocketState,
    applyActiveDevice,
    activateDevice,
    resync,
    invalidateWave,
    joinWave,
    bindServerPlayback,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePlayerStore, import.meta.hot));
}
