import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { ApiError, isOfflineError } from '@/api/http';
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
import { feedbackOnFavorite, feedbackOnLeave, feedbackOnProgress, type WaveListen } from '@/lib/wave-feedback';
import { recordNetEvent, registerNetActivity } from '@/lib/net-log';
import { unlockMediaPlayback } from '@/lib/media-unlock';
import { clearPlayerCache, loadPlayerCache, savePlayerCache } from '@/lib/library-cache';
import { readPlayerDevicePrefs, writePlayerDevicePrefs } from '@/lib/player-prefs';
import { onRealtimeReconnect } from '@/realtime';
import { useAuthStore } from '@/stores/auth';
import { isUnknownDevice, useDevicesStore } from '@/stores/devices';
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

  function freshPlayerState(): PlayerStateView {
    return {
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
    };
  }

  const state = ref<PlayerStateView>(freshPlayerState());
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

  /** Материализованный контекст; для волны — серверное окно. */
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

  /** Активное устройство = источник истины воспроизведения. */
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

  /**
   * Команда с устройством. Если uuid ещё не зарегистрирован — регистрируем.
   * Если сервер устройство уже забыл (404) — регистрируем ещё раз и повторяем.
   * null — зарегистрироваться не вышло.
   */
  async function withDevice<T>(run: (fields: EchoFields) => Promise<T>): Promise<T | null> {
    const devices = useDevicesStore();
    let fields = echo();
    if (!fields) {
      if (!(await devices.ensurePresence())) return null;
      fields = echo();
      if (!fields) return null;
    }
    try {
      return await run(fields);
    } catch (cause) {
      if (!isUnknownDevice(cause)) throw cause;
      devices.registered = false;
      if (!(await devices.registerPresence())) throw cause;
      const again = echo();
      if (!again) throw cause;
      return await run(again);
    }
  }

  /** Тост ошибки сети/бэка; офлайн-ошибки молчат (optimizations.md «Офлайн-гейт»). */
  function toastError(cause: unknown, fallback: string) {
    if (isOfflineError(cause)) return;
    // 401 — сессия уже сбрасывается (unauthorizedHandler → /login): тосты
    // команд в этот момент — шум на пустом экране.
    if (cause instanceof ApiError && cause.kind === 'auth') return;
    toast.show(cause instanceof Error ? cause.message : fallback, '', true);
  }

  /**
   * Команда не ушла: регистрация устройства не прошла. Почти всегда это тот
   * же обрыв сети/бэка — в офлайне молчим (обрыв виден баннером), служебные
   * формулировки про регистрацию юзеру не показываем. Разлогиненному —
   * тоже: его команды уже никому не нужны.
   */
  function toastUnregistered() {
    if (offlinePlayback() || !canCommand.value) return;
    toast.show('Нет соединения с сервером', 'команда не выполнена — повторите', true);
  }

  /** Бэк недостижим (обрыв/таймаут/5xx) — не путать с отказом (4xx): скачанное переживает это локально. */
  function isServerUnreachable(cause: unknown): boolean {
    return (
      cause instanceof ApiError &&
      (cause.kind === 'network' || cause.kind === 'offline' || cause.kind === 'server')
    );
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
      // Фактический источник звука держим локальным и когда сервер уже
      // обнулил active_device_id (presence протухло, пока сеть душила
      // heartbeat): force-подмена серверным замером отматывала бы песню.
      const playingHere = mine != null && audioPlaying.value && canCommand.value;
      // Офлайн-сессия (играли/паузили без сети): локальный транспорт —
      // правда, серверный стейт протух ещё до офлайна (баг 10).
      const offlineLocal = offlineSession && mine != null && canCommand.value;
      if (stillActive || playingHere || offlineLocal) applyServerStateMerged(payload);
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
  /** Пока применяем серверный стейт, скачок позиции не считается прослушиванием волны. */
  let applyingServer = false;

  /** Локальная позиция в стейт (целые секунды): иначе сырой position_seconds
   *  (последний seek/репорт) устаревает, и пауза/слияние прыгали на него. */
  function writeLocalPosition() {
    state.value = { ...state.value, position_seconds: Math.round(extrapolatedPosition.value) };
  }

  function applyServerStateMerged(payload: PlayerStatePayload) {
    if (!payload?.state) return;
    serverStateApplied = true;
    applyingServer = true;
    state.value = {
      ...payload.state,
      current_snapshot: state.value.current_snapshot,
      is_playing: state.value.is_playing,
    };
    // Позицию НЕ пересаживаем из стейта и якорь не двигаем: у активного
    // устройства элемент — источник правды (timeupdate), обрывать плавный
    // ход экстраполяции каждый репорт — прогресс дёргался бы раз в 10 с.
    writeLocalPosition();
    applyClipsEnabled(payload.state.clips_enabled);
    queue.value = sortQueue(payload.queue ?? []);
    queueLoaded.value = true;
    queueMicrotask(() => {
      applyingServer = false;
    });
    void syncContextWithSource();
  }

  // --- Активное устройство: активация и авто-активация (api.md §4)

  /**
   * Активация устройства (api.md §4). Ответ — полный стейт плеера: применяем
   * сразу, своё эхо playback.device.changed роутер глушит. Активное в стейте
   * переключаем оптимистично, при ошибке — откат.
   */
  async function activateDevice(deviceUuid: string): Promise<boolean> {
    const prevActive = state.value.active_device_id;
    applyActiveDevice(deviceUuid);
    try {
      const payload = await withDevice((fields) => devicesApi.activateDevice(deviceUuid, fields));
      if (!payload) {
        applyActiveDevice(prevActive);
        toastUnregistered();
        return false;
      }
      // Само-реактивация посреди воспроизведения: серверная позиция в ответе
      // — последний репорт (до 10 с отстаёт), force-подмена отматывала бы
      // играющий элемент. Факт воспроизведения остаётся локальным. То же для
      // офлайн-сессии: старт скачанного мог ещё не заиграть (audioPlaying
      // false), но локальный трек уже выбран и подменять его нельзя (баг 14).
      const mine = useDevicesStore().myDeviceUuid;
      if (mine != null && deviceUuid === mine && (audioPlaying.value || offlineSession)) {
        applyServerStateMerged(payload);
      } else {
        applyServerState(payload, { force: true });
      }
      return true;
    } catch (cause) {
      applyActiveDevice(prevActive);
      toastError(cause, 'Не удалось переключить устройство');
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
   * Потолок доверия к `position_updated_at` убран: бэк штампует его свежим
   * временем в каждом broadcast'е, и экстраполяция от штампа дёргала
   * прогресс. Позиция — целые секунды, тикают таймером (1 с).
   */

  function anchorPosition() {
    anchor.value = Math.round(state.value.position_seconds);
    anchorAt = Date.now();
  }

  function applyServerState(payload: PlayerStatePayload, opts: { force?: boolean } = {}) {
    if (!payload?.state) return;
    // Версии монотонны (бэк-фикс 2026-11-25): устаревшие и дубли отсекаем.
    if (!opts.force && serverStateApplied && payload.state.version <= state.value.version) return;
    serverStateApplied = true;
    applyingServer = true;
    state.value = payload.state;
    // Полная подмена — серверный стейт теперь локальная правда: офлайн-
    // расхождение (если было) закрыто, resync снова может подменять.
    offlineSession = false;
    // Полная подмена — результат чужой команды (или холодного старта):
    // позиция сервера теперь такая, следующие broadcast'ы будут нести её же.
    lastPositionPushSeconds = payload.state.position_seconds;
    applyClipsEnabled(payload.state.clips_enabled);
    // Сокет-репорты позиции несут ту же очередь — не пересоздаём массив,
    // чтобы список очереди не перерисовывался на каждый репорт.
    const nextQueue = sortQueue(payload.queue ?? []);
    if (!sameQueue(nextQueue, queue.value)) queue.value = nextQueue;
    queueLoaded.value = true;
    anchorPosition();
    queueMicrotask(() => {
      applyingServer = false;
    });
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

  /**
   * Ответ своей команды, не меняющей транспорт (repeat/shuffle/clips), на
   * активном устройстве: координация (версия, режимы, очередь) — из сервера,
   * а трек/позиция/is_playing — локальные. Force-подмена пересаживала якорь
   * на серверный замер позиции (последний репорт, до 10 с назад) — движок
   * отматывал элемент, и каждый клик shuffle дёргал звук (баг 11). Свои
   * команды по сокету и так глушатся эхо-фильтром роутера. Пульт — зеркало:
   * полная подмена.
   */
  function applyCommandState(payload: PlayerStatePayload) {
    if (serverStateApplied && isActiveDevice.value) applyServerStateMerged(payload);
    else applyServerState(payload, { force: true });
  }

  /** Сокет-ивент playback.state.updated (эхо и дедуп уже отсеял роутер):
   *  пейлоад — тот же JSON, что GET /player (state + queue, api.md §17).
   *  Активное устройство — источник истины воспроизведения: координацию
   *  (версию, очередь, режимы, активное устройство) берём с сервера, а свой
   *  трек/позицию/is_playing протухшим замером не подменяем — ивент шлётся
   *  и по регистрации устройства, с позицией последнего репорта, и её
   *  применение дёргало бы звук назад. Транспорт совпал и позиция в стейте —
   *  та, что мы сами отправляли (последний репорт/seek), — слияние. Позиция
   *  чужая (пульт seek'нул/поставил паузу) или транспорт не совпал — целиком. */
  function applySocketState(payload: PlayerStatePayload) {
    if (!payload?.state) return;
    if (serverStateApplied && payload.state.version <= state.value.version) return;
    if (serverStateApplied && isActiveDevice.value) {
      const mine = state.value;
      const theirs = payload.state;
      const sameTransport =
        theirs.is_playing === mine.is_playing &&
        (theirs.current_snapshot ? snapshotKey(theirs.current_snapshot) : '') ===
          (mine.current_snapshot ? snapshotKey(mine.current_snapshot) : '');
      if (sameTransport) {
        // Позиция, которую мы сами отправляли (репорт/seek), а штамп сервер
        // свежит при любом broadcast'е: по штампу такой ивент не отличить
        // от чужой команды, а force-применение отматывало играющий элемент
        // к округлённому репорту («буксование»). Своя позиция — слиянием.
        const ownPosition =
          lastPositionPushSeconds == null || Math.abs(theirs.position_seconds - lastPositionPushSeconds) <= 1.5;
        console.debug(
          `[player] socket ${ownPosition ? 'merged (своя позиция)' : 'force (чужая позиция)'}` +
            ` позиция=${theirs.position_seconds} push=${lastPositionPushSeconds} версия=${theirs.version}`,
        );
        if (ownPosition) {
          applyServerStateMerged(payload);
          return;
        }
      }
    }
    applyServerState(payload);
  }

  // --- Контекст (resolver): favorites/uploads/волна —
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
      toastError(cause, 'Не удалось включить волну');
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

  /**
   * Токен транспортной команды (play/restart): быстрое листание шлёт
   * команды подряд, а применяет ответ только последняя — поздний ответ
   * прежней команды не откатывает уже выбранный трек. Летящий /play
   * прежнего токена отменяем совсем: на бэк дожидается только последний.
   */
  let playToken = 0;
  let playAbort: AbortController | null = null;

  /**
   * Локальная офлайн-сессия: транспортные действия без сети (play/pause/
   * seek/restart) разошлись с сервером. Пока флаг стоит, resync на
   * reconnect сливает стейт по владению (локальный трек/позиция/is_playing —
   * правда), а не подменяет force'ом: серверный стейт протух ещё до офлайна,
   * и его применение воскрешало старый трек, отматывало позицию или
   * включало воспроизведение (баг 10). Снимается любой полной подменой
   * стейта (команда онлайн, чужой seek с пульта) и logout'ом.
   */
  let offlineSession = false;

  /**
   * Соседи виртуального потока для предзагрузки stream URL
   * (frontend.md §9): движок знает и очередь, и контекст, и волну.
   */
  function adjacentSnapshots(aheadCount: number, backCount: number) {
    return peekAdjacent(engineContext(), aheadCount, backCount);
  }

  /**
   * Летящая догрузка страницы контекста: быстрое листание у края ждёт
   * один и тот же запрос, а не стреляет страницей на каждый тап.
   */
  let contextExpandInflight: { key: string; promise: Promise<boolean> } | null = null;

  /** Следующая страница пагинированного контекста; true — список вырос. */
  function expandContextPage(source: 'search' | 'playlist'): Promise<boolean> {
    const key = contextKeyOf(source, state.value.context_ref);
    if (contextExpandInflight?.key === key) return contextExpandInflight.promise;
    const promise = (async () => {
      try {
        const page = await fetchContextPage(
          {
            playSource: source,
            contextRef: state.value.context_ref,
            currentType: state.value.current_snapshot?.type ?? null,
          },
          contextNextPage,
        );
        if (!page || contextKeyLoaded !== key) return false;
        const known = new Set(contextItems.value.map((item) => snapshotKey(item)));
        const fresh = page.items.filter((item) => !known.has(snapshotKey(item)));
        contextItems.value = [...contextItems.value, ...fresh];
        contextHasMore = page.hasMore;
        contextNextPage += 1;
        return fresh.length > 0;
      } catch {
        return false;
      }
    })().finally(() => {
      if (contextExpandInflight?.key === key) contextExpandInflight = null;
    });
    contextExpandInflight = { key, promise };
    return promise;
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
    if (!(await expandContextPage(source))) return action;
    return resolveNext(engineContext(), reason);
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
    cancelPendingSeek();
    // Без блокировки «переход уже идёт»: каждый тап считается от текущего
    // (уже оптимистичного) стейта, поэтому быстрое листание идёт подряд,
    // а гонки ответов разруливает playToken в playSnapshot.
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
    })();
  }

  /** Автопереход по `ended` с аудио-элемента. */
  function handleTrackEnded() {
    skipNext('ended');
  }

  async function skipPrevious() {
    cancelPendingSeek();
    await runAction(offlinePlayback() ? offlinePrevious() : resolvePrevious(engineContext(), positionSeconds.value));
  }

  /** Рестарт текущего трека: позиция 0, воспроизведение продолжается. */
  async function restartTrack() {
    cancelPendingSeek();
    state.value = {
      ...state.value,
      position_seconds: 0,
      is_playing: true,
    };
    anchorPosition();
    // Серверная позиция часто ещё 0, а элемент уже ушёл вперёд — вотч по
    // position_seconds тогда не стреляет, и сброс не доходит до звука.
    mediaSeek.value += 1;
    if (offlinePlayback()) offlineSession = true;
    if (!canCommand.value || offlinePlayback()) return;
    // Рестарт владеет транспортом: поздний ответ прежнего /play его не откатывает.
    const token = ++playToken;
    const prevPush = lastPositionPushSeconds;
    lastPositionPushSeconds = 0;
    try {
      const payload = await withDevice((fields) => playerApi.seekTo(0, fields));
      if (token !== playToken) return;
      if (!payload) {
        lastPositionPushSeconds = prevPush;
        return;
      }
      applyServerState(payload, { force: true });
    } catch (cause) {
      if (token !== playToken) return;
      lastPositionPushSeconds = prevPush;
      toastError(cause, 'Не удалось перезапустить трек');
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
   * ожидания resolver.
   */
  async function playSnapshot(
    snapshot: AnySnapshot,
    playbackSource: PlaySource = 'single',
    opts: { rollSeed?: boolean; contextItems?: AnySnapshot[]; contextRef?: string | null } = {},
  ) {
    // До await: жест тапа ещё жив, иначе play() после get-url браузер глушит.
    unlockMediaPlayback();
    if (offlinePlayback() && !offlinePlayable(snapshot)) return;
    const leaving = state.value.current_snapshot;
    const sameTrack =
      leaving != null &&
      snapshotKey(leaving) === snapshotKey(snapshot) &&
      state.value.play_source === playbackSource;
    if (!sameTrack) finishWaveListen();
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
      if (offlinePlayback()) offlineSession = true;
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
    // Быстрое листание: каждый запуск — новый токен. Летящий /play прежнего
    // тапа отменяем, а его поздний ответ/ошибку отбрасываем — актуален
    // только последний запуск, где остановились.
    const token = ++playToken;
    playAbort?.abort();
    const controller = new AbortController();
    playAbort = controller;
    // Скачанный трек звучит из локального файла: старт не ждёт сервер,
    // а обрыв сети его не откатывает (баг 14) — координацию догоняем ниже.
    const localSound = offlinePlayable(snapshot);
    // Оптимистичный старт: на LTE ответ /play едет секунды, а тап уже выбрал
    // трек. Применяем его сразу (движки параллельно идут за потоком — звук
    // стартует раньше), при ошибке откатываемся. Пульт не оптимизируем: его
    // resync/активация ниже переписали бы стейт до ответа дважды. Скачанное
    // стартует всегда и ДО активации: ждать мёртвый бэк нельзя.
    const optimistic = isActiveDevice.value || localSound;
    const prevState = state.value;
    if (optimistic) {
      state.value = {
        ...state.value,
        current_snapshot: snapshot,
        position_seconds: 0,
        is_playing: true,
        play_source: playbackSource,
      };
      anchorPosition();
    }
    // Пока синхронизация скачанного летит, локальный транспорт — правда:
    // resync/само-активация сливают стейт по владению, а не подменяют его
    // серверным (механика бага 10), иначе force-подмена вернула бы старый трек.
    if (localSound) offlineSession = true;
    // «Играть будет это устройство»: без онлайн-активного активируемся сами.
    if (!isActiveDevice.value) {
      await ensureActiveForPlayback();
      if (token !== playToken) return;
    }
    // /play стартует трек с 0 и на сервере: housekeeping-broadcast'ы будут
    // нести 0 — позиция наша, слияние по владению, не подмена.
    const prevPush = lastPositionPushSeconds;
    lastPositionPushSeconds = 0;
    try {
      const extra: { context_ref?: string | null; shuffle_seed?: string | null } = {
        shuffle_seed: opts.rollSeed === false ? undefined : crypto.randomUUID(),
      };
      if (contextRef !== undefined) extra.context_ref = contextRef;
      const payload = await withDevice((fields) =>
        playerApi.playSnapshot(snapshot, playbackSource, fields, extra, controller.signal),
      );
      if (token !== playToken) return;
      if (!payload) {
        lastPositionPushSeconds = prevPush;
        // Скачанное уже звучит из файла: незарегистрированное устройство
        // (та же мёртвая сеть) — не повод откатывать трек и тостить.
        if (localSound) return;
        if (optimistic) {
          state.value = prevState;
          anchorPosition();
        }
        toastUnregistered();
        return;
      }
      // Скачанное: транспорт уже локальный и позиция ушла вперёд от нуля —
      // ответ сливаем по владению (координация с сервера), не подменяем.
      // Сервер команду принял — офлайн-сессии больше нет.
      if (localSound) {
        offlineSession = false;
        applyServerStateMerged(payload);
        return;
      }
      applyServerState(payload, { force: true });
    } catch (cause) {
      // Отменён следующим тапом или уже неактуален — не ошибка, молча выходим.
      if (token !== playToken || controller.signal.aborted) return;
      lastPositionPushSeconds = prevPush;
      // Мёртвый бэк не откатывает скачанный трек: он играет из файла,
      // а офлайн-сессия сохранит его при reconnect-resync (баги 10/14).
      if (localSound && isServerUnreachable(cause)) return;
      if (optimistic) {
        state.value = prevState;
        anchorPosition();
      }
      toastError(cause, 'Не удалось включить');
      void resync();
    } finally {
      if (playAbort === controller) playAbort = null;
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
      // Нескачанный трек в офлайне играть нечем: без гарда тогл пускал
      // прогресс «в никуда» — ползунок бежал, а звука не было.
      if (!state.value.is_playing && (!state.value.current_snapshot || !offlinePlayable(state.value.current_snapshot))) {
        toast.show('Трек не скачан', 'в офлайне играет только скачанное', true);
        return;
      }
      // Перед остановкой локальную позицию кладём в стейт: иначе сырое
      // position_seconds (последний seek/репорт) протухало, и пауза
      // прыгала прогрессом назад, часто в 0.
      if (offlinePlayback()) offlineSession = true;
      writeLocalPosition();
      state.value = {
        ...state.value,
        is_playing: !state.value.is_playing,
      };
      anchorPosition();
      return;
    }
    if (!canCommand.value) {
      writeLocalPosition();
      state.value = {
        ...state.value,
        is_playing: !state.value.is_playing,
      };
      anchorPosition();
      return;
    }
    const wasPlaying = state.value.is_playing;
    // Рассинхрон после загрузки страницы/сбоя потока: сервер уверен, что
    // играем, а элемент активного устройства молчит (автоплей отклонён,
    // ссылка протухла). Обычный toggle дал бы паузу — и второй тап (resume)
    // не помог бы: is_playing не меняется, вотчеры элемент не пинают.
    // Пинаем движок напрямую, сервер не трогаем.
    if (wasPlaying && isActiveDevice.value && !audioPlaying.value) {
      // Загрузка (резолв клипа, get-url, прогрев) — не рассинхрон: тап во
      // время неё — честная пауза. В клип-режиме звук резолвом больше не
      // маскируется, и без этого выхода пауза была бы недоступна до кадра.
      if (engineLoading.value || streamWarming.value || clipStatus.value === 'resolving') {
        await commitTransport(false);
        return;
      }
      unlockMediaPlayback();
      kickEngine();
      return;
    }
    await commitTransport(!wasPlaying);
  }

  let hardwareAt = 0;

  /**
   * Медиа-клавиша. В отличие от togglePlay, пауза уходит на бэк даже если
   * элемент уже замолчал сам: иначе сервер остаётся в play.
   */
  async function hardwareTransport(action: 'play' | 'pause') {
    if (action === 'pause' && !state.value.is_playing) return;
    if (action === 'play' && state.value.is_playing) {
      if (isActiveDevice.value && !audioPlaying.value) {
        unlockMediaPlayback();
        kickEngine();
      }
      return;
    }
    const now = Date.now();
    if (now - hardwareAt < 350) return;
    hardwareAt = now;
    await commitTransport(action === 'play');
  }

  async function commitTransport(wantPlaying: boolean) {
    if (state.value.is_playing === wantPlaying) return;
    if (wantPlaying) {
      unlockMediaPlayback();
      // Resume = «играть здесь»: без онлайн-активного активируемся сами.
      if (canCommand.value && !offlinePlayback() && !isActiveDevice.value) {
        await ensureActiveForPlayback();
        if (state.value.is_playing) return;
      }
    }
    if (!canCommand.value || offlinePlayback()) {
      if (!wantPlaying) cancelPendingSeek();
      // Играть нескачанное в офлайне нечем — иначе «play» без звука,
      // с бегущим ползунком (то же, что закрыли в togglePlay).
      if (wantPlaying && (!state.value.current_snapshot || !offlinePlayable(state.value.current_snapshot))) return;
      if (offlinePlayback()) offlineSession = true;
      writeLocalPosition();
      state.value = {
        ...state.value,
        is_playing: wantPlaying,
      };
      anchorPosition();
      return;
    }
    const wasPlaying = !wantPlaying;
    // Оптимистично, с откатом по ошибке. Пауза сама
    // увозит позицию — висящий seek отменяем, чтобы не дёргать бэк дважды.
    if (wasPlaying) cancelPendingSeek();
    writeLocalPosition();
    state.value = {
      ...state.value,
      is_playing: wantPlaying,
    };
    anchorPosition();
    const prevPush = lastPositionPushSeconds;
    try {
      if (wasPlaying) lastPositionPushSeconds = Math.round(extrapolatedPosition.value);
      const payload = await withDevice((fields) =>
        wasPlaying
          ? playerApi.pausePlayback(fields, Math.round(extrapolatedPosition.value))
          : playerApi.resumePlayback(fields),
      );
      if (!payload) {
        lastPositionPushSeconds = prevPush;
        // Скачанное переживает мёртвый бэк локально (та же логика, что в playSnapshot).
        if (state.value.current_snapshot && offlinePlayable(state.value.current_snapshot)) {
          offlineSession = true;
          return;
        }
        state.value = {
          ...state.value,
          is_playing: wasPlaying,
        };
        anchorPosition();
        toastUnregistered();
        return;
      }
      applyServerState(payload, { force: true });
    } catch (cause) {
      lastPositionPushSeconds = prevPush;
      if (
        state.value.current_snapshot &&
        offlinePlayable(state.value.current_snapshot) &&
        isServerUnreachable(cause)
      ) {
        offlineSession = true;
        return;
      }
      state.value = {
        ...state.value,
        is_playing: wasPlaying,
      };
      anchorPosition();
      toastError(cause, 'Не удалось переключить воспроизведение');
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
    try {
      const payload = await withDevice((fields) => playerApi.patchPlaybackOptions({ repeat_mode: next }, fields));
      if (!payload) return;
      applyCommandState(payload);
    } catch (cause) {
      toastError(cause, 'Не удалось сменить повтор');
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
    // Включение — ролл ключа («перемешать заново»); выключение — seed: null.
    const seed = next ? crypto.randomUUID() : null;
    try {
      const payload = await withDevice((fields) => playerApi.patchPlaybackOptions({ shuffle_enabled: next }, fields, seed));
      if (!payload) return;
      applyCommandState(payload);
    } catch (cause) {
      toastError(cause, 'Не удалось переключить shuffle');
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
  /** Свой ориентир для периодичности: слияние по владению position_seconds не
   *  пересаживает, сравнивать с ним было бы «отставанием от протухшего замера». */
  let lastReportedSeconds = 0;
  /**
   * Последняя позиция, которую мы сами отправили на сервер (периодический
   * репорт, seek, пауза с позицией, /play). Бэк свежит position_updated_at
   * в каждом broadcast'е (регистрация устройства, presence-планировщик),
   * а позиция в нём — последний репорт: по одному штампу такой ивент
   * не отличить от seek'а с пульта. Отличник — совпадение позиции
   * с нашей последней отправкой.
   */
  let lastPositionPushSeconds: number | null = null;

  async function reportPosition() {
    const now = Date.now();
    if (now - lastReportAt < POSITION_REPORT_INTERVAL_MS) return;
    const seconds = Math.round(extrapolatedPosition.value);
    if (Math.abs(seconds - lastReportedSeconds) < POSITION_REPORT_INTERVAL_MS / 1000) return;
    console.debug(`[player] report: шлём ${seconds} с (прошлый репорт ${lastReportedSeconds})`);
    lastReportAt = now;
    lastReportedSeconds = seconds;
    const prevPush = lastPositionPushSeconds;
    lastPositionPushSeconds = seconds;
    try {
      // Ответ на свой репорт: координация из сервера, а position_seconds
      // пишем локальную точную — не округлённый серверный замер (протухает
      // на RTT). Иначе стейт застывает на 0/последнем seek'е, и пауза или
      // слияние по владению прыгают прогрессом назад, вплоть до старта песни.
      const payload = await withDevice((fields) => playerApi.seekTo(seconds, fields));
      if (!payload) return;
      applyServerStateMerged(payload);
      writeLocalPosition();
    } catch {
      lastPositionPushSeconds = prevPush;
      /* следующий тик повторит */
    }
  }

  /** Аудио-элемент активного устройства реально звучит (метит композабл по событиям). */
  const audioPlaying = ref(false);
  /**
   * Видео ждёт буфер (`waiting`/`stalled`) при включённом воспроизведении.
   * `playing` уже был, поэтому audioPlaying остаётся true — без этого флага
   * ползунок дальше тикает по часам, хотя кадр стоит.
   */
  const playbackStalled = ref(false);
  /**
   * Пинок движку: элемент должен реально заиграть. Счётчик, а не колбэк —
   * движки (аудио/видео) сами решают, кто из них текущий, по своим вотчерам.
   */
  const engineKick = ref(0);

  function setAudioPlaying(playing: boolean) {
    audioPlaying.value = playing;
  }

  /** Застыть на текущей секунде и продолжить с неё, когда буфер доедет. */
  function setPlaybackStalled(stalled: boolean, atSeconds?: number) {
    if (playbackStalled.value === stalled && atSeconds == null) return;
    const measured = atSeconds != null && Number.isFinite(atSeconds) ? atSeconds : extrapolatedPosition.value;
    anchor.value = Math.max(0, Math.round(measured));
    anchorAt = Date.now();
    playbackStalled.value = stalled;
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
   * Пульт и гости зеркалят сервер — им верить нечему. Загрузка — не
   * рассинхрон: резолв клипа, get-url и прогрев до первого кадра держат
   * честную тишину со спиннером — значок паузы на них не подменяем
   * (в клип-режиме аудио резолв больше не маскирует своим звуком).
   */
  const playbackDesynced = computed(
    () =>
      state.value.is_playing &&
      !!state.value.current_snapshot &&
      canCommand.value &&
      isActiveDevice.value &&
      !audioPlaying.value &&
      !engineLoading.value &&
      !streamWarming.value &&
      clipStatus.value !== 'resolving',
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
    const prevPush = lastPositionPushSeconds;
    lastPositionPushSeconds = Math.round(extrapolatedPosition.value);
    void playerApi
      .pausePlayback(fields, Math.round(extrapolatedPosition.value))
      .then((payload) => applyServerState(payload, { force: true }))
      .catch(() => {
        lastPositionPushSeconds = prevPush;
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

  /** Экстраполированная позиция: целые секунды, тик раз в секунду.
   *  Никакой миллисекундной математики от штампов — только целочисленный
   *  счётчик от якоря. */
  const extrapolatedPosition = computed(() => {
    if (!state.value.is_playing) return anchor.value;
    // Позиция идёт только когда звук реально идёт: пока качается ссылка или
    // ждём первый кадр, ползунок стоит — иначе полоска растёт на обложке со
    // спиннером. Пульт видео не грузит (потоки — только на активном,
    // optimizations.md «Клипы только на активном») — его зеркало тикает
    // по часам, как аудио-зеркало.
    const loading =
      !audioPlaying.value || engineLoading.value || streamWarming.value || playbackStalled.value;
    if (isActiveDevice.value && loading) {
      return anchor.value;
    }
    // Кламп снизу: между применением якоря и ближайшим тиком тикера
    // nowTick ещё отстоит от anchorAt — floor давал бы −1 и позиция
    // на секунду прыгала назад.
    return anchor.value + Math.max(0, Math.floor((nowTick.value - anchorAt) / 1000));
  });

  /** Актуальная позиция из аудио-элемента: переустанавливает якорь (целые секунды). */
  function anchorFromAudio(seconds: number) {
    anchor.value = Math.round(seconds);
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

  /** Добавление в конец очереди. true — принято (сервером или локально в офлайне). */
  async function enqueueSnapshot(snapshot: AnySnapshot): Promise<boolean> {
    // Офлайн (баг 24): пункт «В очередь» доступен для скачанного — кладём
    // локальный pending-элемент (offlineNext берёт очередь первой), на
    // коннекте дошлём на сервер (syncQueueAfterConnect).
    if (offlinePlayback()) {
      const position = queue.value.reduce((max, item) => Math.max(max, item.position), 0) + 1;
      queue.value = sortQueue([
        ...queue.value,
        {
          id: nextOfflineQueueId--,
          player_state_id: state.value.id,
          added_by_user_id: null,
          position,
          status: 'pending',
          snapshot,
        },
      ]);
      offlineQueueAdds.push(snapshot);
      return true;
    }
    try {
      queue.value = sortQueue(await queueApi.addToQueue(snapshot));
      return true;
    } catch (cause) {
      toastError(cause, 'Не удалось добавить в очередь');
      return false;
    }
  }

  async function removeQueueItem(id: number) {
    // Офлайн: локальные добавки убираем локально (серверные в офлайне не трогаем).
    if (offlinePlayback()) {
      const item = queue.value.find((entry) => entry.id === id);
      if (!item || item.id > 0) return;
      queue.value = queue.value.filter((entry) => entry.id !== id);
      dropOfflineQueueAdd(item.snapshot);
      return;
    }
    try {
      queue.value = sortQueue(await queueApi.removeFromQueue(id));
    } catch (cause) {
      toastError(cause, 'Не удалось убрать из очереди');
    }
  }

  /** Перенос по индексам: бэку уходит id переносимого элемента и целевая позиция (api.md §6). */
  async function reorderQueue(from: number, to: number) {
    if (from === to) return;
    const moved = queue.value[from];
    if (!moved) return;
    try {
      queue.value = sortQueue(await queueApi.movePending(moved.id, to));
    } catch (cause) {
      toastError(cause, 'Не удалось изменить порядок');
    }
  }

  function snapshotId(snapshot: AnySnapshot | null | undefined) {
    return snapshot && 'source_id' in snapshot ? snapshot.source_id : null;
  }

  /**
   * Офлайн-добавки в очередь (баг 24): снапшоты локальных pending-элементов
   * (отрицательные id), ждущие досыла на сервер. Играть офлайн их можно и
   * так — offlineNext берёт очередь первой; буфер нужен только для синка.
   */
  const offlineQueueAdds: AnySnapshot[] = [];
  let nextOfflineQueueId = -1;

  function dropOfflineQueueAdd(snapshot: AnySnapshot | null | undefined) {
    if (!snapshot) return;
    const index = offlineQueueAdds.findIndex((item) => snapshotKey(item) === snapshotKey(snapshot));
    if (index !== -1) offlineQueueAdds.splice(index, 1);
  }

  /**
   * Очередь после коннекта: дошиваем офлайн-добавки, потом рефетч.
   * Сыгранные/убранные офлайн из буфера уже выпали (dropFromQueue),
   * на сервер они не возвращаются.
   */
  async function syncQueueAfterConnect() {
    const pending = offlineQueueAdds.splice(0);
    for (const snapshot of pending) {
      try {
        await queueApi.addToQueue(snapshot);
      } catch {
        /* недошедшая добавка не критична — очередь всё равно рефетчится */
      }
    }
    await refreshQueue();
  }

  function dropFromQueue(sourceId: string | null) {
    if (!sourceId) return;
    // Сыгранный/выбранный трек выпадает и из буфера офлайн-добавок:
    // на сервер уходят только ещё ждущие в очереди.
    const buffered = offlineQueueAdds.findIndex((item) => item.source_id === sourceId);
    if (buffered !== -1) offlineQueueAdds.splice(buffered, 1);
    if (queue.value.some((item) => item.snapshot?.source_id === sourceId)) {
      queue.value = queue.value.filter((item) => item.snapshot?.source_id !== sourceId);
    }
  }

  // --- Производные для UI

  const current = computed(() => state.value.current_snapshot);

  // Громкость и качество клипа живут в Preferences, как история поиска.
  // Режим клипов здесь не храним: серверный clips_enabled — источник истины,
  // устройства иначе расходились бы в режиме (на одном видео, на другом аудио).
  // Качество наоборот локальное (экраны устройств разные, сокетами его не
  // синхронизируем). Персистим именно выбор пользователя: рабочий clipQuality
  // клампится по потокам прогрессива и затёр бы предпочтение.
  let prefsHydrating = true;
  let volumeTouched = false;
  let clipQualityTouched = false;
  let preferredClipQuality: number | null = null;
  let preferredClipHlsAuto = true;
  let prefsTimer: ReturnType<typeof setTimeout> | null = null;

  function rememberPlayerPrefs() {
    if (prefsHydrating) return;
    if (prefsTimer) clearTimeout(prefsTimer);
    prefsTimer = setTimeout(() => {
      prefsTimer = null;
      void writePlayerDevicePrefs({
        volume: volume.value,
        clipQuality: preferredClipQuality,
        clipHlsAuto: preferredClipHlsAuto,
      });
    }, 200);
  }

  watch(volume, rememberPlayerPrefs);

  void readPlayerDevicePrefs().then((saved) => {
    if (saved && !volumeTouched) volume.value = saved.volume;
    if (saved?.clipQuality != null && !clipQualityTouched) {
      preferredClipQuality = saved.clipQuality;
      preferredClipHlsAuto = saved.clipHlsAuto;
      clipQuality.value = saved.clipQuality;
      clipHlsAuto.value = saved.clipHlsAuto;
    }
    prefsHydrating = false;
    if (volumeTouched || clipQualityTouched) rememberPlayerPrefs();
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
  // Фидбек волны только с непрослушанного захода. Прослушанные можно
  // листать быстро — реакции на них нет.
  let waveListen: (WaveListen & { key: string; trackId: string }) | null = null;

  function noteWaveHeard() {
    const listen = waveListen;
    if (!listen || listen.heard || !audioPlaying.value) return;
    listen.heard = true;
    listen.heardRatio = progress.value / 100;
  }

  function postWaveFeedback(type: 'like' | 'skip') {
    const listen = waveListen;
    if (!listen) return;
    listen.sent = type;
    waveApi.markWaveTrackKey(listen.key);
    if (!listen.trackId) return;
    void waveApi.sendWaveFeedback(listen.trackId, type, positionSeconds.value).catch(() => undefined);
  }

  function finishWaveListen() {
    const listen = waveListen;
    waveListen = null;
    if (!listen) return;
    const type = feedbackOnLeave(listen, progress.value / 100);
    if (!type) return;
    waveListen = listen;
    postWaveFeedback(type);
    waveListen = null;
  }

  function adoptWaveListen() {
    const snapshot = state.value.current_snapshot;
    if (!snapshot || state.value.play_source !== 'wave') {
      waveListen = null;
      return;
    }
    const key = snapshotKey(snapshot);
    if (waveListen?.key === key) return;
    waveListen = {
      key,
      trackId: snapshot.source_id,
      unplayed: !waveApi.isWaveTrackPlayed(snapshot),
      liked: false,
      disliked: false,
      sent: null,
      heard: false,
      heardRatio: 0,
    };
    noteWaveHeard();
  }

  /** Лайк или дизлайк текущего непрослушанного трека волны. */
  function noteWaveFavorite(snapshot: AnySnapshot, added: boolean) {
    if (!waveListen || snapshotKey(snapshot) !== waveListen.key) return;
    const type = feedbackOnFavorite(waveListen, added);
    if (!type) return;
    waveListen.liked = added;
    waveListen.disliked = !added;
    postWaveFeedback(type);
  }

  watch(
    () =>
      [state.value.play_source, state.value.current_snapshot ? snapshotKey(state.value.current_snapshot) : ''] as const,
    () => adoptWaveListen(),
    { immediate: true },
  );

  watch(audioPlaying, (playing) => {
    if (playing) noteWaveHeard();
  });

  watch(progress, (value) => {
    if (applyingServer || !waveListen || !isActiveDevice.value || !audioPlaying.value) return;
    if (feedbackOnProgress(waveListen, value / 100) !== 'like') return;
    postWaveFeedback('like');
  });

  watch(progress, (next, prev) => {
    const step = next - (prev ?? 0);
    const duration = durationSeconds.value;
    const tickPct = duration > 0 ? (1.5 / duration) * 100 : 0;
    // Пульт звука не имеет, но зеркало играет — ползунок тоже ползёт плавно.
    const sounding = audioPlaying.value || (!isActiveDevice.value && canCommand.value);
    const flowing = isPlaying.value && sounding && !engineLoading.value && !streamWarming.value && !playbackStalled.value;
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
    const prevPush = lastPositionPushSeconds;
    lastPositionPushSeconds = seconds;
    void withDevice((fields) => playerApi.seekTo(seconds, fields)).catch((cause) => {
      // Позиция на бэк не доехала: метка «наша позиция у сервера» неверна,
      // иначе следующий housekeeping-ивент снялся бы как чужой seek.
      lastPositionPushSeconds = prevPush;
      // Скачанное мотается локально и без бэка: офлайн-сессия, без тоста (баг 14).
      if (state.value.current_snapshot && offlinePlayable(state.value.current_snapshot) && isServerUnreachable(cause)) {
        offlineSession = true;
        return;
      }
      toastError(cause, 'Не удалось перемотать');
    });
  }

  function seek(seconds: number) {
    const max = durationSeconds.value;
    if (!max) return;
    // Целые секунды — как у бэка (api.md §5): миллисекундная точность
    // прогрессу не нужна, а дёргалась от неё он постоянно.
    state.value = {
      ...state.value,
      position_seconds: Math.round(Math.min(max, Math.max(0, seconds))),
    };
    anchorPosition();
    if (offlinePlayback()) offlineSession = true;
    // Локальный seek обязан доехать до элемента даже < 2.5 с: мы источник
    // правды своего звука. Без бампа вотчер подгонки глушил мелкие seeks.
    mediaSeek.value += 1;
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
    // Чистое видео не на что переключать: выключение оставило бы пустой звук.
    if (current.value?.type === 'video') return;
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
    const next = !clipMode.value;
    const prev = clipMode.value;
    // Оптимистично, с откатом: движок начинает резолв клипа сразу, без
    // ожидания ответа (пульт увидит бродкастом).
    clipMode.value = next;
    if (!next) clearClip();
    try {
      const payload = await withDevice((fields) => playerApi.patchPlaybackOptions({ clips_enabled: next }, fields));
      if (!payload) {
        clipMode.value = prev;
        if (!prev) clearClip();
        toastUnregistered();
        return;
      }
      applyCommandState(payload);
    } catch (cause) {
      clipMode.value = prev;
      if (!prev) clearClip();
      toastError(cause, 'Не удалось переключить режим клипов');
      void resync();
    }
  }

  function setClipResolving() {
    clipStatus.value = 'resolving';
  }

  /** Резолв приехал: клип закрепляется за треком. hls в resolve нет (api.md §8) —
   *  стартуем на прогрессиве, манифест добирает движок ближайшим get-url.
   *  Качество между клипами не сбрасываем: выбор пользователя персистится. */
  function setClipResolved(track: TrackSnapshot, video: VideoSnapshot, streams: VideoStream[]) {
    clipTrackKey.value = snapshotKey(track);
    clipVideo.value = video;
    clipStatus.value = 'ready';
    clipAudioId.value = null;
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
  // Тот же ролик, включённый уже как видео (поиск), — не клип на треке.
  // Потоки не сбрасываем: иначе элемент снимается с плеера и больше не
  // возвращается, потому что ключ ролика уже считается загруженным.
  watch(
    () => (current.value ? snapshotKey(current.value) : null),
    (key) => {
      if (key === clipTrackKey.value) return;
      const overlay = clipVideo.value;
      if (
        current.value?.type === 'video' &&
        overlay &&
        snapshotKey(overlay) === snapshotKey(current.value)
      ) {
        clipVideo.value = null;
        clipTrackKey.value = null;
        clipStatus.value = 'idle';
        return;
      }
      clearClip();
    },
  );

  function setClipQuality(quality: number) {
    clipQualityTouched = true;
    preferredClipQuality = quality;
    preferredClipHlsAuto = false;
    clipHlsAuto.value = false;
    clipQuality.value = quality;
    rememberPlayerPrefs();
  }

  /** HLS-режим: вернуться к ABR (потолок — clipQuality), выбор ручника отменяется. */
  function setClipQualityAuto() {
    clipQualityTouched = true;
    preferredClipHlsAuto = true;
    clipHlsAuto.value = true;
    rememberPlayerPrefs();
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

  // --- Жизненный цикл: старт/реконнект

  let unbindReconnect: (() => void) | null = null;

  /**
   * Полный локальный стоп по выходу из аккаунта (и по 401): звук, летящие
   * команды, очередь, контекст, тикер позиции, закачки. Без него после
   * logout продолжала играть песня (офлайн-ветка isActiveDevice не глушит,
   * медиасессия могла возобновить), а догоняющие запросы с мёртвым токеном
   * сыпали тостами ошибок.
   */
  function teardownLocalPlayback() {
    cancelPendingSeek();
    playAbort?.abort();
    playAbort = null;
    playToken += 1;
    stopPositionTicker();
    waveListen = null;
    nextShuffleSeed = null;
    offlineSession = false;
    lastPositionPushSeconds = null;
    lastReportedSeconds = 0;
    lastReportAt = 0;
    state.value = freshPlayerState();
    anchorPosition();
    queue.value = [];
    queueLoaded.value = false;
    offlineQueueAdds.length = 0;
    contextItems.value = [];
    contextKeyLoaded = null;
    contextHasMore = false;
    contextNextPage = 2;
    contextToken += 1;
    expanded.value = false;
    clipMode.value = false;
    clearClip();
    audioPlaying.value = false;
    playbackStalled.value = false;
    useDownloadsStore().cancelActive();
  }

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
    const auth = useAuthStore();
    // Сервер обнуляет active_device_id, когда presence активного протухает
    // (api.md §4, планировщик раз в минуту): сеть могла задушить heartbeat
    // на время, а мы остаёмся фактическим активным — звук идёт, а стейт уже
    // «пульт», движок глушит поток посреди воспроизведения. Возвращаем себе
    // активность; чужую (другой uuid) не перехватываем — выбор пользователя.
    let reactivating = false;
    watch(isActiveDevice, async (active, was) => {
      if (active || was !== true || reactivating) return;
      if (!audioPlaying.value || !canCommand.value || offlinePlayback()) return;
      if (state.value.active_device_id != null) return;
      const uuid = useDevicesStore().myDeviceUuid;
      if (!uuid) return;
      reactivating = true;
      try {
        await activateDevice(uuid);
      } finally {
        reactivating = false;
      }
    });
    watch(
      () => [auth.isAuthed, useOnlineStore().isOnline] as const,
      ([authed, online]) => {
        if (authed) {
          startPositionTicker();
          unbindReconnect ??= onRealtimeReconnect(() => {
            void syncQueueAfterConnect();
            void resync();
          });
          const userId = auth.user?.id;
          void (async () => {
            if (userId) await hydratePlayer(userId);
            if (!useAuthStore().isAuthed) return;
            persistReady = true;
            if (online !== true) return;
            void syncQueueAfterConnect();
            void resync();
          })();
        } else {
          persistReady = false;
          hydratedUserId = null;
          serverStateApplied = false;
          teardownLocalPlayback();
          void clearPlayerCache();
          unbindReconnect?.();
          unbindReconnect = null;
        }
      },
      { immediate: true },
    );
  }

  // Диагностика офлайн-флапа: журнал зондов на экране
  // настроек показывает, что делало приложение в момент промаха health.
  // «get-url» и «ждёт playing» разделены: это разные узкие места (запрос
  // ссылки против ожидания первого кадра); запас буфера и ступень HLS
  // добавляют пробы движков ('клип'/'звук').
  registerNetActivity('player', () => {
    const parts: string[] = [];
    if (state.value.is_playing) parts.push(audioPlaying.value ? 'играет' : 'play без звука');
    if (engineLoading.value) parts.push('get-url');
    if (streamWarming.value) parts.push('ждёт playing');
    if (playbackStalled.value) parts.push('буфер');
    if (pendingSeekSeconds != null) parts.push('seek');
    return parts.length ? parts.join(' · ') : null;
  });

  // Переходы активного устройства — в журнал сети: «активация слетела»
  // в поле иначе не отличить от команды пульта (источник виден по соседним
  // записям: presence/disconnect/коннекты).
  watch(
    () => state.value.active_device_id,
    (active, prev) => {
      if (active === prev) return;
      const mine = useDevicesStore().myDeviceUuid;
      const mark = (uuid: string | null) => (uuid == null ? '—' : uuid === mine ? 'это устройство' : uuid);
      recordNetEvent('active-device', `${mark(prev)} → ${mark(active)}`);
    },
  );

  return {
    state,
    expanded,
    // Автопауза при загрузке выключена (см. applyServerState): функция
    // выставлена наружу, чтобы не быть мёртвым кодом, вызов не стартует.
    reconcileBoot,
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
    setPlaybackStalled,
    setEngineLoading,
    setStreamWarming,
    anchorFromAudio,
    togglePlay,
    hardwareTransport,
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
    noteWaveFavorite,
    bindServerPlayback,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePlayerStore, import.meta.hot));
}
