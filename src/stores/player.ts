import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import * as playerApi from '@/api/player';
import * as queueApi from '@/api/queue';
import * as waveApi from '@/api/wave';
import type { VideoHls, VideoStream } from '@/api/videos';
import type { ClipAudioTrack } from '@/lib/hls-engine';
import { fetchFavorites } from '@/api/favorites';
import { resolveNext, resolvePrevious, snapshotKey, SKIP_RESTART_AFTER, type EngineAction, type EngineContext } from '@/lib/playback-engine';
import { moveItem } from '@/lib/list-sort';
import { unlockMediaPlayback } from '@/lib/media-unlock';
import { favoriteTracks } from '@/mocks/catalog';
import { mockPlayerState } from '@/mocks/player';
import { onRealtimeReconnect } from '@/realtime';
import { useAuthStore } from '@/stores/auth';
import { useDevicesStore } from '@/stores/devices';
import { useToastStore } from '@/stores/toast';
import type { AnySnapshot, EchoFields, PlaySource, PlayerStatePayload, PlayerStateView, QueueItem, RepeatMode, TrackSnapshot, VideoSnapshot } from '@/types';

const repeatCycle: RepeatMode[] = ['off', 'all', 'one'];

/** Период репорта позиции с активного устройства (api.md §5, план §3). */
export const POSITION_REPORT_INTERVAL_MS = 10_000;

/** Пауза после последнего движения ползунка, через которую seek уходит на сервер. */
export const SEEK_COMMIT_DELAY_MS = 300;

export const usePlayerStore = defineStore('player', () => {
  const toast = useToastStore();

  // --- Состояние (источник истины — сервер; до первого ответа живёт мок)

  const state = ref<PlayerStateView>(mockPlayerState.state);
  /** Серверный стейт уже применялся (мок перекрыт). До этого version-gate не работает. */
  let serverStateApplied = false;

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
  const contextItems = ref<AnySnapshot[]>([...favoriteTracks]);
  /** Для какого play_source загружен contextItems (null — мок-начальник). */
  let contextSource: PlaySource | null = null;
  /** Токен гонок контекста: применяет результат только последний запрос. */
  let contextToken = 0;

  // --- Роли и команды (api.md §1.6: эхо-поля всегда с uuid устройства)

  /** Активное устройство = источник истины воспроизведения (plan-player.md §5). */
  const isActiveDevice = computed(() => {
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
    try {
      applyServerState(await playerApi.fetchPlayerState(), { force: true });
    } catch {
      /* resync — лучшее, что могли */
    }
  }

  // --- Применение состояния: ответ команды (force) → сокет (version-gate) → GET на reconnect (force)

  function anchorPosition() {
    anchor.value = state.value.position_seconds;
    anchorAt = Date.now();
  }

  function applyServerState(payload: PlayerStatePayload, opts: { force?: boolean } = {}) {
    if (!payload?.state) return;
    if (!opts.force && serverStateApplied && payload.state.version <= state.value.version) return;
    serverStateApplied = true;
    // DEBUG(2026-11-23): фиксация расхождения снапшота на проводе — убрать после сверки.
    if (payload.state.current_snapshot) {
      console.debug('[player] state.current_snapshot keys:', Object.keys(payload.state.current_snapshot));
    }
    state.value = payload.state;
    queue.value = sortQueue(payload.queue ?? []);
    queueLoaded.value = true;
    anchorPosition();
    reconcileBoot();
    void syncContextWithSource();
  }

  /** Сокет-ивент playback.state.updated (эхо и дедуп уже отсеял роутер). */
  function applySocketState(view: PlayerStateView) {
    applyServerState({ state: view, queue: queue.value });
  }

  // --- Контекст (resolver, plan-player.md §2/§7): пока favorites с API и волна целиком

  async function syncContextWithSource() {
    const source = state.value.play_source;
    if (source === contextSource) return;
    const token = ++contextToken;
    contextSource = source;
    try {
      if (source === 'favorites') {
        const favorites = await fetchFavorites();
        if (token !== contextToken || contextSource !== 'favorites') return;
        contextItems.value = favorites.tracks;
      } else if (source === 'wave') {
        const window = await waveApi.fetchWaveWindow();
        if (token !== contextToken || contextSource !== 'wave') return;
        contextItems.value = window;
      } else {
        contextItems.value = [];
      }
    } catch {
      /* контекст догрузится со следующим переходом */
    }
  }

  /** Ивент playback.wave.updated: окно изменилось — перечитываем целиком (api.md §14). */
  function invalidateWave() {
    if (contextSource === 'wave') contextSource = null;
    void syncContextWithSource();
  }

  // --- Догрузка окна по исчерпании контекста: пока GET /wave провоцирует рост
  // окна сам (api.md §14), фронт дёргает его, когда до конца волны остаётся
  // играть текущий трек. Срабатывает на переходе «стал последним» — пока
  // сидим на последнем треке повторных запросов нет (окно не выросло — не выросло).

  const waveTailReached = computed(() => {
    if (state.value.play_source !== 'wave' || !state.value.current_snapshot) return false;
    const items = contextItems.value;
    if (!items.length) return false;
    const index = items.findIndex((item) => snapshotKey(item) === snapshotKey(state.value.current_snapshot!));
    return index === items.length - 1;
  });

  watch(waveTailReached, (reached) => {
    if (!reached) return;
    void waveApi
      .fetchWaveWindow()
      .then((window) => {
        if (contextSource !== 'wave' || state.value.play_source !== 'wave') return;
        contextItems.value = window;
      })
      .catch(() => {
        /* следующий переход на хвост повторит */
      });
  });

  /**
   * Вход в волну с главной: окно у сервера уже есть, играем его первый
   * снапшот с source=wave — ротация дальше пойдёт по этому окну.
   */
  async function joinWave() {
    try {
      const window = await waveApi.fetchWaveWindow();
      const first = window[0];
      if (!first) return;
      await playSnapshot(first, 'wave', { contextItems: window });
    } catch (cause) {
      toast.show(errorText(cause, 'Не удалось включить волну'), '', true);
    }
  }

  async function loadFavoritesContext(): Promise<AnySnapshot[]> {
    if (contextSource === 'favorites' && contextItems.value.length) return contextItems.value;
    const token = ++contextToken;
    contextSource = 'favorites';
    try {
      const favorites = await fetchFavorites();
      if (token === contextToken && contextSource === 'favorites') contextItems.value = favorites.tracks;
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

  function skipNext(reason: 'manual' | 'ended' = 'manual') {
    if (transitioning) return;
    cancelPendingSeek();
    transitioning = true;
    void runAction(resolveNext(engineContext(), reason)).finally(() => {
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
    void runAction(resolvePrevious(engineContext(), state.value.position_seconds)).finally(() => {
      transitioning = false;
    });
  }

  /** Рестарт текущего трека: позиция 0, воспроизведение продолжается. */
  async function restartTrack() {
    cancelPendingSeek();
    if (!canCommand.value) {
      state.value = { ...state.value, position_seconds: 0, is_playing: true };
      anchorPosition();
      return;
    }
    const fields = echo();
    if (!fields) return;
    try {
      applyServerState(await playerApi.seekTo(0, fields), { force: true });
    } catch (cause) {
      toast.show(errorText(cause, 'Не удалось перезапустить трек'), '', true);
    }
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
    cancelPendingSeek();
    dropFromQueue(snapshotId(snapshot));
    if (opts.contextItems) {
      contextItems.value = opts.contextItems;
      contextSource = playbackSource;
    }
    if (!canCommand.value) {
      state.value = {
        ...state.value,
        current_snapshot: snapshot,
        position_seconds: 0,
        is_playing: true,
        play_source: playbackSource,
      };
      anchorPosition();
      return;
    }
    const fields = echo();
    if (!fields) {
      toast.show('Устройство ещё не зарегистрировано', '', true);
      return;
    }
    try {
      // Тап из списка всегда задаёт контекст — ref шлём (null чистит старое).
      const extra: { context_ref?: string | null; shuffle_seed?: string | null } = {
        shuffle_seed: opts.rollSeed === false ? undefined : crypto.randomUUID(),
      };
      if (playbackSource !== 'single' || opts.contextRef !== undefined) {
        extra.context_ref = opts.contextRef ?? null;
      }
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

  async function togglePlay() {
    if (!canCommand.value) {
      state.value = { ...state.value, is_playing: !state.value.is_playing };
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
    if (!wasPlaying) unlockMediaPlayback();
    // Оптимистично, с откатом по ошибке (plan-player.md §5). Пауза сама
    // увозит позицию — висящий seek отменяем, чтобы не дёргать бэк дважды.
    if (wasPlaying) cancelPendingSeek();
    state.value = { ...state.value, is_playing: !wasPlaying };
    anchorPosition();
    try {
      const payload = wasPlaying
        ? await playerApi.pausePlayback(fields, Math.round(extrapolatedPosition.value))
        : await playerApi.resumePlayback(fields);
      applyServerState(payload, { force: true });
    } catch (cause) {
      state.value = { ...state.value, is_playing: wasPlaying };
      anchorPosition();
      toast.show(errorText(cause, 'Не удалось переключить воспроизведение'), '', true);
      void resync();
    }
  }

  async function toggleRepeat() {
    const index = repeatCycle.indexOf(state.value.repeat_mode);
    const next = repeatCycle[(index + 1) % repeatCycle.length];
    if (!canCommand.value) {
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
    if (!canCommand.value) {
      state.value = { ...state.value, shuffle_enabled: next };
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
  const nowTick = ref(0);
  let positionTimer: ReturnType<typeof setInterval> | null = null;

  function startPositionTicker() {
    stopPositionTicker();
    positionTimer = setInterval(() => {
      nowTick.value = Date.now();
      if (canCommand.value && isActiveDevice.value && state.value.is_playing) {
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
      pauseToServer();
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
  const title = computed(() => current.value?.title ?? '');
  const artist = computed(() =>
    current.value?.artists.map((a) => a.name).join(', ') ?? '',
  );
  const previewNext = computed<AnySnapshot | null>(() => {
    const action = resolveNext(engineContext(), 'manual');
    return action.action === 'play' ? action.snapshot : null;
  });
  const previewPrevious = computed<AnySnapshot | null>(() => {
    const action = resolvePrevious(engineContext(), SKIP_RESTART_AFTER);
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

  // --- Seek: локально сразу, на сервер — одним запросом после остановки драга

  let seekCommitTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSeekSeconds: number | null = null;

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
    if (!canCommand.value) return;
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

  // --- Режим клипов (api.md §8): тогл — локальное UI-состояние, резолв — в useVideoPlayback

  function toggleClips() {
    if (clipMode.value) {
      clipMode.value = false;
      clearClip();
      return;
    }
    clipMode.value = true;
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

  function syncClipMode() {
    if (current.value?.type === 'video') clipMode.value = true;
  }

  watch(() => current.value?.type, syncClipMode);

  function openExpanded() {
    syncClipMode();
    if (current.value) expanded.value = true;
  }

  function closeExpanded() {
    expanded.value = false;
  }

  function setVolume(percent: number) {
    volume.value = Math.round(Math.min(100, Math.max(0, percent)));
  }

  // --- Жизненный цикл: старт/реконнект (plan-player.md §5)

  let unbindReconnect: (() => void) | null = null;

  /** Первичная загрузка состояния и рефетч на reconnect (полная подмена зеркала). */
  function bindServerPlayback() {
    startPositionTicker();
    const auth = useAuthStore();
    watch(
      () => auth.isAuthed,
      (authed) => {
        if (authed) {
          void refreshQueue();
          void resync();
          unbindReconnect ??= onRealtimeReconnect(() => {
            void refreshQueue();
            void resync();
          });
        } else {
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
    positionSeconds,
    audioPlaying,
    engineKick,
    engineLoading,
    streamWarming,
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
    invalidateWave,
    joinWave,
    bindServerPlayback,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePlayerStore, import.meta.hot));
}
