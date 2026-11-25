import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import * as devicesApi from '@/api/devices';
import * as playerApi from '@/api/player';
import * as queueApi from '@/api/queue';
import * as searchApi from '@/api/search';
import { useAuthStore } from '@/stores/auth';
import { useDevicesStore } from '@/stores/devices';
import { useOnlineStore } from '@/stores/online';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type { PlayerDevice, QueueItem, SearchPagePayload, TrackSnapshot, VideoSnapshot } from '@/types';

vi.mock('@/api/queue', () => ({
  fetchQueue: vi.fn(),
  addToQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderPending: vi.fn(),
}));

vi.mock('@/api/search', () => ({
  fetchSearch: vi.fn(),
}));

vi.mock('@/api/player', () => ({
  fetchPlayerState: vi.fn(),
  playSnapshot: vi.fn(),
  pausePlayback: vi.fn(),
  resumePlayback: vi.fn(),
  seekTo: vi.fn(),
  patchPlaybackOptions: vi.fn(),
}));

vi.mock('@/api/devices', () => ({
  fetchDevices: vi.fn(),
  registerDevice: vi.fn(),
  activateDevice: vi.fn(),
  removeDevice: vi.fn(),
  sendHeartbeat: vi.fn(),
}));

const fetchQueueMock = vi.mocked(queueApi.fetchQueue);
const addToQueueMock = vi.mocked(queueApi.addToQueue);
const removeFromQueueMock = vi.mocked(queueApi.removeFromQueue);
const reorderPendingMock = vi.mocked(queueApi.reorderPending);
const fetchSearchMock = vi.mocked(searchApi.fetchSearch);
const patchPlaybackOptionsMock = vi.mocked(playerApi.patchPlaybackOptions);
const fetchPlayerStateMock = vi.mocked(playerApi.fetchPlayerState);
const pausePlaybackMock = vi.mocked(playerApi.pausePlayback);
const playSnapshotMock = vi.mocked(playerApi.playSnapshot);
const resumePlaybackMock = vi.mocked(playerApi.resumePlayback);
const activateDeviceMock = vi.mocked(devicesApi.activateDevice);

const track: TrackSnapshot = {
  type: 'track',
  source_type: 'yandex_music',
  source_id: 't1',
  title: 'радиотишина',
  artists: [{ name: 'завтра' }],
  duration_ms: 200000,
  cover_url: null,
  album: null,
  stream_url: null,
};

function makeItem(id: number, position: number, snapshot: TrackSnapshot | null = track): QueueItem {
  return {
    id,
    player_state_id: 1,
    added_by_user_id: null,
    position,
    status: 'pending',
    snapshot,
  };
}

describe('stores/player: очередь', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fetchQueueMock.mockReset();
    addToQueueMock.mockReset();
    removeFromQueueMock.mockReset();
    reorderPendingMock.mockReset();
  });

  it('ensureQueue: грузит один раз и сортирует по position', async () => {
    fetchQueueMock.mockResolvedValue([makeItem(2, 2), makeItem(1, 1)] as never);
    const player = usePlayerStore();

    await player.ensureQueue();
    await player.ensureQueue();

    expect(fetchQueueMock).toHaveBeenCalledTimes(1);
    expect(player.queue.map((item) => item.id)).toEqual([1, 2]);
  });

  it('ensureQueue: при ошибке флажок сбрасывается — следующий вызов пробует снова', async () => {
    fetchQueueMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([] as never);
    const player = usePlayerStore();

    await player.ensureQueue();
    await player.ensureQueue();

    expect(fetchQueueMock).toHaveBeenCalledTimes(2);
    expect(player.queue).toEqual([]);
  });

  it('enqueueSnapshot: постит снапшот, очередь из ответа', async () => {
    addToQueueMock.mockResolvedValue([makeItem(5, 1)] as never);
    const player = usePlayerStore();

    const added = await player.enqueueSnapshot(track);

    expect(added).toBe(true);
    expect(addToQueueMock).toHaveBeenCalledWith(track);
    expect(player.queue.map((item) => item.id)).toEqual([5]);
  });

  it('enqueueSnapshot: ошибка — тост, очередь не тронута, false', async () => {
    addToQueueMock.mockRejectedValue(new Error('Слишком часто. Подождите.'));
    const player = usePlayerStore();
    const toast = useToastStore();

    const added = await player.enqueueSnapshot(track);

    expect(added).toBe(false);
    expect(player.queue).toEqual([]);
    expect(toast.toast?.error).toBe(true);
  });

  it('removeQueueItem: удаляет и подставляет серверную очередь', async () => {
    removeFromQueueMock.mockResolvedValue([makeItem(2, 1)] as never);
    const player = usePlayerStore();

    await player.removeQueueItem(1);

    expect(removeFromQueueMock).toHaveBeenCalledWith(1);
    expect(player.queue.map((item) => item.id)).toEqual([2]);
  });

  it('reorderQueue: шлёт id ожидающих в новом порядке', async () => {
    fetchQueueMock.mockResolvedValue([makeItem(1, 1), makeItem(2, 2), makeItem(3, 3)] as never);
    reorderPendingMock.mockResolvedValue([makeItem(3, 1), makeItem(1, 2), makeItem(2, 3)] as never);
    const player = usePlayerStore();
    await player.ensureQueue();

    await player.reorderQueue(0, 2);

    expect(reorderPendingMock).toHaveBeenCalledWith([2, 3, 1]);
    expect(player.queue.map((item) => item.id)).toEqual([3, 1, 2]);
  });

  it('reorderQueue: from === to — запроса нет', async () => {
    const player = usePlayerStore();
    await player.reorderQueue(1, 1);
    expect(reorderPendingMock).not.toHaveBeenCalled();
  });

  it('previewNext: первый элемент очереди', async () => {
    fetchQueueMock.mockResolvedValue([makeItem(1, 1), makeItem(2, 2)] as never);
    const player = usePlayerStore();
    await player.ensureQueue();

    expect(player.previewNext?.source_id).toBe('t1');
  });
});

const clip: VideoSnapshot = {
  type: 'video',
  source_type: 'yandex_music',
  source_id: 'v1',
  title: 'радиотишина (клип)',
  artists: [{ name: 'завтра' }],
  duration_ms: 150000,
  cover_url: null,
  watch_url: null,
};

describe('stores/player: подмена снапшота клипом', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function playingTrack() {
    const player = usePlayerStore();
    player.state = { ...player.state, current_snapshot: track, is_playing: true };
    return player;
  }

  it('клип подменяет трек в effectiveCurrent и длительности', () => {
    const player = playingTrack();
    expect(player.effectiveCurrent?.source_id).toBe('t1');
    expect(player.durationSeconds).toBe(200);

    player.toggleClips();
    player.setClipResolved(track, clip, [{ quality: 720, url: 'https://cdn.test/720.mp4' }]);

    expect(player.clipActive).toBe(true);
    expect(player.effectiveCurrent?.source_id).toBe('v1');
    // Ползунок живёт по длительности клипа, метаданные — по-прежнему трека.
    expect(player.durationSeconds).toBe(150);
    expect(player.title).toBe('радиотишина');
  });

  it('тогл обратно возвращает трек, общая позиция сохраняется', () => {
    const player = playingTrack();
    player.toggleClips();
    player.setClipResolved(track, clip, [{ quality: 720, url: 'https://cdn.test/720.mp4' }]);
    player.state = { ...player.state, is_playing: false, position_seconds: 42 };

    player.toggleClips();

    expect(player.clipActive).toBe(false);
    expect(player.effectiveCurrent?.source_id).toBe('t1');
    expect(player.durationSeconds).toBe(200);
    expect(player.state.position_seconds).toBe(42);
  });

  it('клип недоступен — остаёмся на треке', () => {
    const player = playingTrack();
    player.toggleClips();
    player.setClipUnavailable();

    expect(player.clipActive).toBe(false);
    expect(player.effectiveCurrent?.source_id).toBe('t1');
    expect(player.durationSeconds).toBe(200);
  });

  it('чистое видео в current — эффективный снапшот само видео', () => {
    const player = usePlayerStore();
    player.state = { ...player.state, current_snapshot: clip };

    expect(player.effectiveCurrent?.source_id).toBe('v1');
    expect(player.durationSeconds).toBe(150);
  });
});

describe('stores/player: качество клипа', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('прогрессив-список YouTube (один 360p) не сбрасывает выбор в HLS-режиме', () => {
    const player = usePlayerStore();
    player.setClipQuality(1080);

    player.setClipStreams([{ quality: 360, url: 'https://cdn.test/360.mp4' }]);

    expect(player.clipQuality).toBe(1080);
  });

  it('кламп по потокам — только явный (прогрессив-режим): выбор вне списка → максимум', () => {
    const player = usePlayerStore();
    player.setClipQuality(1080);
    player.setClipStreams([{ quality: 360, url: 'https://cdn.test/360.mp4' }]);

    player.clampClipQualityToStreams();

    expect(player.clipQuality).toBe(360);
  });

  it('кламп не трогает выбор, который есть в списке', () => {
    const player = usePlayerStore();
    player.setClipQuality(480);
    player.setClipStreams([
      { quality: 360, url: 'https://cdn.test/360.mp4' },
      { quality: 480, url: 'https://cdn.test/480.mp4' },
    ]);

    player.clampClipQualityToStreams();

    expect(player.clipQuality).toBe(480);
  });
});

describe('stores/player: рассинхрон сервера с реальным воспроизведением', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pausePlaybackMock.mockReset();
    playSnapshotMock.mockReset();
    vi.useFakeTimers();
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Активное автризованное устройство, сервер уверен, что играем трек. */
  function desyncedPlayer() {
    const auth = useAuthStore();
    auth.user = { id: 1 } as never;
    const devices = useDevicesStore();
    devices.myDeviceUuid = 'uuid-1';
    const player = usePlayerStore();
    player.state = {
      ...player.state,
      current_snapshot: track,
      is_playing: true,
      active_device_id: 'uuid-1',
    };
    return player;
  }

  it('togglePlay: элемент молчит — пинок движка, пауза на бэк не уходит', async () => {
    const player = desyncedPlayer();

    await player.togglePlay();

    expect(pausePlaybackMock).not.toHaveBeenCalled();
    expect(player.engineKick).toBe(1);
    expect(player.state.is_playing).toBe(true);
  });

  it('togglePlay: элемент реально играет — обычная пауза', async () => {
    const player = desyncedPlayer();
    player.setAudioPlaying(true);
    pausePlaybackMock.mockResolvedValue({ state: { ...player.state, is_playing: false }, queue: [] } as never);

    await player.togglePlay();

    expect(pausePlaybackMock).toHaveBeenCalledTimes(1);
    expect(player.engineKick).toBe(0);
  });

  it('isPlaying: грейс, затем честная пауза; элемент заиграл — сразу плей', async () => {
    const player = desyncedPlayer();
    expect(player.isPlaying).toBe(true);
    await vi.advanceTimersByTimeAsync(1_600);
    expect(player.isPlaying).toBe(false);
    player.setAudioPlaying(true);
    expect(player.isPlaying).toBe(true);
  });

  it('isPlaying: пульт зеркалит сервер, пауза — сразу false', () => {
    const player = desyncedPlayer();
    player.state = { ...player.state, active_device_id: 'другое-устройство' };
    expect(player.isPlaying).toBe(true);

    const paused = desyncedPlayer();
    paused.state = { ...paused.state, is_playing: false };
    expect(paused.isPlaying).toBe(false);
  });

  it('playOrToggle: тап по текущему — тоггл, по иному — прямой запуск', async () => {
    const player = desyncedPlayer();
    player.setAudioPlaying(true);
    pausePlaybackMock.mockResolvedValue({ state: { ...player.state, is_playing: false }, queue: [] } as never);
    playSnapshotMock.mockResolvedValue({ state: { ...player.state }, queue: [] } as never);

    await player.playOrToggle(track);
    expect(pausePlaybackMock).toHaveBeenCalledTimes(1);
    expect(playSnapshotMock).not.toHaveBeenCalled();

    const other = { ...track, source_id: 't2' };
    await player.playOrToggle(other);
    expect(playSnapshotMock).toHaveBeenCalledTimes(1);
    expect(playSnapshotMock.mock.calls[0]?.[0]).toEqual(other);
  });

  it('загрузка страницы: автопауза выключена — паузу не шлём', async () => {
    const player = desyncedPlayer();
    pausePlaybackMock.mockResolvedValue({ state: { ...player.state, is_playing: false }, queue: [] } as never);

    player.applyServerState({ state: { ...player.state, is_playing: true }, queue: [] }, { force: true });
    await Promise.resolve();

    expect(pausePlaybackMock).not.toHaveBeenCalled();
    expect(player.state.is_playing).toBe(true);
  });

  it('загрузка страницы: неактивное устройство — паузу не шлём', async () => {
    const player = desyncedPlayer();
    player.state = { ...player.state, active_device_id: 'другое-устройство' };

    player.applyServerState({ state: { ...player.state }, queue: [] }, { force: true });
    await Promise.resolve();

    expect(pausePlaybackMock).not.toHaveBeenCalled();
  });

  it('загрузка страницы: гость (нет авторизации) — паузу не шлём', async () => {
    const devices = useDevicesStore();
    devices.myDeviceUuid = 'uuid-1';
    const player = usePlayerStore();
    player.state = {
      ...player.state,
      current_snapshot: track,
      is_playing: true,
      active_device_id: 'uuid-1',
    };

    player.applyServerState({ state: { ...player.state }, queue: [] }, { force: true });
    await Promise.resolve();

    expect(pausePlaybackMock).not.toHaveBeenCalled();
  });

  it('загрузка страницы: одноразовая — повторные применения стейта молчат', async () => {
    const player = desyncedPlayer();
    pausePlaybackMock.mockResolvedValue({ state: { ...player.state, is_playing: false }, queue: [] } as never);

    player.applyServerState({ state: { ...player.state, is_playing: true }, queue: [] }, { force: true });
    await Promise.resolve();
    player.applyServerState({ state: { ...player.state, is_playing: true }, queue: [] }, { force: true });
    await Promise.resolve();

    expect(pausePlaybackMock).not.toHaveBeenCalled();
  });

  it('реконсиляция: автопауза выключена — молчание паузу не шлёт', async () => {
    const player = desyncedPlayer();
    pausePlaybackMock.mockResolvedValue({ state: { ...player.state, is_playing: false }, queue: [] } as never);

    await vi.advanceTimersByTimeAsync(3_200);

    expect(pausePlaybackMock).not.toHaveBeenCalled();
    expect(player.state.is_playing).toBe(true);
  });

  it('реконсиляция: поток ещё грузится — паузу не шлём', async () => {
    const player = desyncedPlayer();
    player.setEngineLoading(true);
    pausePlaybackMock.mockResolvedValue({ state: { ...player.state, is_playing: false }, queue: [] } as never);

    await vi.advanceTimersByTimeAsync(6_000);

    expect(pausePlaybackMock).not.toHaveBeenCalled();
  });

  it('реконсиляция: поток греется до playing — паузу не шлём', async () => {
    const player = desyncedPlayer();
    player.setStreamWarming(true);
    pausePlaybackMock.mockResolvedValue({ state: { ...player.state, is_playing: false }, queue: [] } as never);

    await vi.advanceTimersByTimeAsync(6_000);

    expect(pausePlaybackMock).not.toHaveBeenCalled();
  });

  it('реконсиляция: элемент заиграл до тика — паузу отменили', async () => {
    const player = desyncedPlayer();
    pausePlaybackMock.mockResolvedValue({ state: { ...player.state, is_playing: false }, queue: [] } as never);

    await vi.advanceTimersByTimeAsync(1_000);
    player.setAudioPlaying(true);
    await vi.advanceTimersByTimeAsync(4_000);

    expect(pausePlaybackMock).not.toHaveBeenCalled();
    expect(player.isPlaying).toBe(true);
  });
});


describe('stores/player: активация устройства', () => {
  const me: PlayerDevice = {
    device_uuid: 'uuid-1',
    name: 'Мой телефон',
    type: 'phone',
    last_seen_at: null,
  };
  const other: PlayerDevice = { ...me, device_uuid: 'uuid-2', name: 'Планшет' };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    const auth = useAuthStore();
    auth.user = { id: 1 } as never;
    const devices = useDevicesStore();
    devices.myDeviceUuid = 'uuid-1';
  });

  /** Авторизованный стор с треком; активное устройство задаёт тест. */
  function playerWith(activeUuid: string | null, online: PlayerDevice[] = []) {
    const player = usePlayerStore();
    player.state = {
      ...player.state,
      current_snapshot: track,
      is_playing: false,
      active_device_id: activeUuid,
      devices: online,
    };
    return player;
  }

  it('activateDevice: ответ применяется к стейту плеера', async () => {
    const player = playerWith('uuid-1', [me, other]);
    activateDeviceMock.mockResolvedValue({
      state: { ...player.state, active_device_id: 'uuid-2' },
      queue: [],
    } as never);

    await expect(player.activateDevice('uuid-2')).resolves.toBe(true);

    expect(activateDeviceMock).toHaveBeenCalledWith('uuid-2', {
      origin_device_id: 'uuid-1',
      command_id: expect.any(String),
    });
    expect(player.state.active_device_id).toBe('uuid-2');
  });

  it('activateDevice: ошибка — откат активного в стейте, тост, false', async () => {
    const player = playerWith('uuid-1', [me, other]);
    activateDeviceMock.mockRejectedValue(new Error('бэк упал'));

    await expect(player.activateDevice('uuid-2')).resolves.toBe(false);

    expect(player.state.active_device_id).toBe('uuid-1');
    expect(useToastStore().toast?.error).toBe(true);
  });

  it('activateDevice: регистрация не удалась — API активации не зовём', async () => {
    const devices = useDevicesStore();
    devices.myDeviceUuid = null;
    vi.mocked(devicesApi.registerDevice).mockRejectedValue(new Error('down'));
    const player = playerWith(null);

    await expect(player.activateDevice('uuid-2')).resolves.toBe(false);
    expect(activateDeviceMock).not.toHaveBeenCalled();
  });

  it('playSnapshot: я активен — ни resync, ни активации', async () => {
    const player = playerWith('uuid-1', [me]);
    playSnapshotMock.mockResolvedValue({ state: { ...player.state }, queue: [] } as never);

    await player.playSnapshot(track, 'favorites');

    expect(fetchPlayerStateMock).not.toHaveBeenCalled();
    expect(activateDeviceMock).not.toHaveBeenCalled();
    expect(playSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it('playSnapshot: онлайн-активного нет — сначала активация, потом /play', async () => {
    const player = playerWith(null);
    fetchPlayerStateMock.mockResolvedValue({
      state: { ...player.state, active_device_id: null, devices: [] },
      queue: [],
    } as never);
    activateDeviceMock.mockResolvedValue({
      state: { ...player.state, active_device_id: 'uuid-1', devices: [me] },
      queue: [],
    } as never);
    playSnapshotMock.mockResolvedValue({ state: { ...player.state }, queue: [] } as never);

    await player.playSnapshot(track, 'favorites');

    expect(activateDeviceMock).toHaveBeenCalledWith('uuid-1', expect.anything());
    expect(playSnapshotMock).toHaveBeenCalledTimes(1);
    expect(activateDeviceMock.mock.invocationCallOrder[0]).toBeLessThan(
      playSnapshotMock.mock.invocationCallOrder[0],
    );
  });

  it('playSnapshot: активно другое онлайн-устройство — остаёмся пультом', async () => {
    const player = playerWith('uuid-2', [other]);
    fetchPlayerStateMock.mockResolvedValue({
      state: { ...player.state, active_device_id: 'uuid-2', devices: [other] },
      queue: [],
    } as never);
    playSnapshotMock.mockResolvedValue({ state: { ...player.state }, queue: [] } as never);

    await player.playSnapshot(track, 'favorites');

    expect(activateDeviceMock).not.toHaveBeenCalled();
    expect(playSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it('togglePlay (resume): активного нет — активация + resume', async () => {
    const player = playerWith(null);
    fetchPlayerStateMock.mockResolvedValue({
      state: { ...player.state, active_device_id: null, devices: [] },
      queue: [],
    } as never);
    activateDeviceMock.mockResolvedValue({
      state: { ...player.state, active_device_id: 'uuid-1', devices: [me] },
      queue: [],
    } as never);
    resumePlaybackMock.mockResolvedValue({
      state: { ...player.state, is_playing: true, active_device_id: 'uuid-1', devices: [me] },
      queue: [],
    } as never);

    await player.togglePlay();

    expect(activateDeviceMock).toHaveBeenCalledWith('uuid-1', expect.anything());
    expect(resumePlaybackMock).toHaveBeenCalledTimes(1);
    expect(player.state.is_playing).toBe(true);
  });

  it('togglePlay (пауза): чужое активное — пауза без активации и resync', async () => {
    const player = playerWith('uuid-2', [other]);
    player.state = { ...player.state, is_playing: true };
    pausePlaybackMock.mockResolvedValue({
      state: { ...player.state, is_playing: false },
      queue: [],
    } as never);

    await player.togglePlay();

    expect(pausePlaybackMock).toHaveBeenCalledTimes(1);
    expect(activateDeviceMock).not.toHaveBeenCalled();
    expect(fetchPlayerStateMock).not.toHaveBeenCalled();
  });

  it('applyActiveDevice: патчит стейт; повтор тем же uuid — без изменений', () => {
    const player = playerWith('uuid-1', [me]);

    player.applyActiveDevice('uuid-2');
    expect(player.state.active_device_id).toBe('uuid-2');

    player.applyActiveDevice(null);
    expect(player.state.active_device_id).toBeNull();
  });
});


describe('stores/player: realtime-синхронизация', () => {
  const me: PlayerDevice = {
    device_uuid: 'uuid-1',
    name: 'Мой телефон',
    type: 'phone',
    last_seen_at: null,
  };
  const other: PlayerDevice = { ...me, device_uuid: 'uuid-2', name: 'Планшет' };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    const auth = useAuthStore();
    auth.user = { id: 1 } as never;
    const devices = useDevicesStore();
    devices.myDeviceUuid = 'uuid-1';
    vi.mocked(playerApi.seekTo).mockResolvedValue({ state: null as never, queue: [] } as never);
  });

  describe('экстраполяция позиции по position_updated_at', () => {
    /** Зеркало пульта: играет чужое устройство, замер позиции 5 с назад. */
    function remoteMirror(over: Record<string, unknown> = {}) {
      const player = usePlayerStore();
      player.applyServerState(
        {
          state: {
            ...player.state,
            current_snapshot: track,
            is_playing: true,
            position_seconds: 100,
            position_updated_at: new Date(Date.now() - 5_000).toISOString(),
            active_device_id: 'uuid-2',
            devices: [other],
            ...over,
          },
          queue: [],
        } as never,
        { force: true },
      );
      return player;
    }

    it('свежий штамп: якорь докидывает время с момента замера', () => {
      const player = remoteMirror();
      // Докид ≈5 с; нижняя граница с запасом на мс между созданием стора
      // (nowTick) и применением стейта — они вычитаются из экстраполяции.
      expect(player.positionSeconds).toBeGreaterThan(104);
      expect(player.positionSeconds).toBeLessThan(107);
    });

    it('пауза: докида нет', () => {
      const player = remoteMirror({ is_playing: false });
      expect(player.positionSeconds).toBe(100);
    });

    it('протухший штамп: докид 0 — страховка от кривых часов и resume без штампа', () => {
      const player = remoteMirror({
        position_updated_at: new Date(Date.now() - 300_000).toISOString(),
      });
      expect(player.positionSeconds).toBeLessThan(101);
    });

    it('позиционный репорт не двигает экстраполяцию рывком', () => {
      const player = remoteMirror();
      const before = player.positionSeconds;

      // Репорт активного: позиция догнала экстраполяцию, штамп свежий.
      player.applySocketState({
        state: {
          ...player.state,
          position_seconds: Math.round(before),
          position_updated_at: new Date().toISOString(),
          version: player.state.version + 1,
        },
        queue: [],
      });

      expect(Math.abs(player.positionSeconds - before)).toBeLessThan(1.5);
    });

    it('сокет-репорт с той же очередью не пересоздаёт список (новые объекты, то же содержимое)', () => {
      const player = remoteMirror();
      const items = [makeItem(1, 1)];
      player.applyServerState(
        { state: { ...player.state, version: player.state.version + 1 }, queue: items } as never,
        { force: true },
      );
      const queueRef = player.queue;

      player.applySocketState({
        state: { ...player.state, position_seconds: 101, version: player.state.version + 1 },
        queue: items.map((item) => ({ ...item })),
      });

      expect(player.queue).toBe(queueRef);
    });

    it('изменившаяся очередь из сокет-стейта применяется', () => {
      const player = remoteMirror();
      player.applyServerState(
        { state: { ...player.state, version: player.state.version + 1 }, queue: [makeItem(1, 1)] } as never,
        { force: true },
      );

      player.applySocketState({
        state: { ...player.state, version: player.state.version + 1 },
        queue: [makeItem(1, 1), makeItem(2, 2)],
      });

      expect(player.queue.map((item) => item.id)).toEqual([1, 2]);
    });

    it('ожидание буфера не двигает позицию активного устройства', () => {
      vi.useFakeTimers();
      try {
        const player = usePlayerStore();
        player.applyServerState(
          {
            state: {
              ...player.state,
              current_snapshot: track,
              is_playing: true,
              position_seconds: 10,
              position_updated_at: new Date().toISOString(),
              active_device_id: 'uuid-1',
              devices: [me],
            },
            queue: [],
          } as never,
          { force: true },
        );
        player.setAudioPlaying(true);
        player.bindServerPlayback();
        const start = player.positionSeconds;
        vi.advanceTimersByTime(3000);
        expect(player.positionSeconds).toBeGreaterThan(start + 2);

        player.setPlaybackStalled(true);
        const frozen = player.positionSeconds;
        vi.advanceTimersByTime(4000);
        expect(Math.abs(player.positionSeconds - frozen)).toBeLessThan(0.05);

        player.setPlaybackStalled(false);
        vi.advanceTimersByTime(2000);
        expect(player.positionSeconds).toBeGreaterThan(frozen + 1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('локальный seek обновляет штамп — старый elapsed не прилипает', () => {
      vi.useFakeTimers();
      try {
        const player = usePlayerStore();
        // Я активен, играю; штамп 20-секундной давности (в пределах доверия).
        player.applyServerState(
          {
            state: {
              ...player.state,
              current_snapshot: track,
              is_playing: true,
              position_seconds: 30,
              position_updated_at: new Date(Date.now() - 20_000).toISOString(),
              active_device_id: 'uuid-1',
              devices: [me],
            },
            queue: [],
          } as never,
          { force: true },
        );

        player.seek(60);

        // Без свежего штампа к 60 прилипло бы +20 докида.
        expect(player.positionSeconds).toBeGreaterThanOrEqual(60);
        expect(player.positionSeconds).toBeLessThan(62);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('reconnect: слияние по владению', () => {
    it('активное устройство: воспроизведение локальное, координация серверная', async () => {
      const player = usePlayerStore();
      // Холодный старт — первая загрузка всегда полной подменой.
      fetchPlayerStateMock.mockResolvedValue({
        state: {
          ...player.state,
          current_snapshot: track,
          is_playing: true,
          position_seconds: 10,
          active_device_id: 'uuid-1',
          devices: [me],
          version: 8,
        },
        queue: [],
      } as never);
      await player.resync();
      expect(player.state.position_seconds).toBe(10);

      // Локальная жизнь: играем дальше, позиция ушла вперёд.
      player.state = { ...player.state, position_seconds: 77 };

      // Reconnect: сервер отстал (последний репорт — 20), version вырос.
      fetchPlayerStateMock.mockResolvedValue({
        state: {
          ...player.state,
          position_seconds: 20,
          version: 11,
          active_device_id: 'uuid-1',
          devices: [me],
        },
        queue: [makeItem(5, 1)],
      } as never);
      await player.resync();

      expect(player.state.position_seconds).toBe(77);
      expect(player.state.is_playing).toBe(true);
      expect(player.state.current_snapshot?.source_id).toBe(track.source_id);
      expect(player.state.version).toBe(11);
      expect(player.queue.map((item) => item.id)).toEqual([5]);
    });

    it('пульт: reconnect — полная подмена зеркала', async () => {
      const player = usePlayerStore();
      fetchPlayerStateMock.mockResolvedValue({
        state: {
          ...player.state,
          current_snapshot: track,
          is_playing: true,
          position_seconds: 10,
          active_device_id: 'uuid-2',
          devices: [other],
          version: 8,
        },
        queue: [],
      } as never);
      await player.resync();

      player.state = { ...player.state, position_seconds: 77 };
      fetchPlayerStateMock.mockResolvedValue({
        state: { ...player.state, position_seconds: 20, version: 11 },
        queue: [],
      } as never);
      await player.resync();

      expect(player.state.position_seconds).toBe(20);
    });

    it('холодный старт активного устройства: подмена, не слияние', async () => {
      const player = usePlayerStore();
      fetchPlayerStateMock.mockResolvedValue({
        state: {
          ...player.state,
          current_snapshot: { ...track, source_id: 'srv-track' },
          is_playing: true,
          position_seconds: 55,
          active_device_id: 'uuid-1',
          devices: [me],
          version: 9,
        },
        queue: [],
      } as never);
      await player.resync();

      expect(player.state.current_snapshot?.source_id).toBe('srv-track');
      expect(player.state.position_seconds).toBe(55);
    });
  });
});


describe('stores/player: version-gate сокет-стейтов', () => {
  const other: PlayerDevice = {
    device_uuid: 'uuid-2',
    name: 'Планшет',
    type: 'phone',
    last_seen_at: null,
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    const auth = useAuthStore();
    auth.user = { id: 1 } as never;
    useDevicesStore().myDeviceUuid = 'uuid-1';
  });

  function applied(version: number) {
    const player = usePlayerStore();
    player.applyServerState(
      {
        state: { ...player.state, version, position_seconds: 10, active_device_id: 'uuid-2', devices: [other] },
        queue: [],
      } as never,
      { force: true },
    );
    return player;
  }

  it('тот же version — дубль, отбрасывается', () => {
    const player = applied(5);

    player.applySocketState({
      state: { ...player.state, position_seconds: 55, version: 5 },
      queue: [],
    });

    expect(player.state.position_seconds).toBe(10);
  });

  it('старший version отбрасывается', () => {
    const player = applied(5);

    player.applySocketState({
      state: { ...player.state, position_seconds: 99, version: 4 },
      queue: [],
    });

    expect(player.state.position_seconds).toBe(10);
  });

  it('свежий version применяется вместе с очередью из пейлоада', () => {
    const player = applied(5);

    player.applySocketState({
      state: { ...player.state, position_seconds: 55, version: 6 },
      queue: [makeItem(7, 1)],
    });

    expect(player.state.position_seconds).toBe(55);
    expect(player.queue.map((item) => item.id)).toEqual([7]);
  });
});


describe('stores/player: context_ref команды /play', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    const auth = useAuthStore();
    auth.user = { id: 1 } as never;
    useDevicesStore().myDeviceUuid = 'uuid-1';
  });

  /** Активное авторизованное устройство, играет плейлист с серверным ref. */
  function playlistPlayer() {
    const player = usePlayerStore();
    player.state = {
      ...player.state,
      current_snapshot: track,
      is_playing: true,
      active_device_id: 'uuid-1',
      play_source: 'playlist',
      context_ref: 'skyfi:pl-1',
    };
    playSnapshotMock.mockResolvedValue({ state: { ...player.state }, queue: [] } as never);
    return player;
  }

  function extraOf() {
    return playSnapshotMock.mock.calls.at(-1)?.[3] as { context_ref?: string | null } | undefined;
  }

  it('переход движка внутри плейлиста сохраняет серверный ref', async () => {
    const player = playlistPlayer();

    await player.playSnapshot(track, 'playlist', { rollSeed: false });

    expect(extraOf()?.context_ref).toBe('skyfi:pl-1');
  });

  it('явный contextRef из вызова побеждает над серверным', async () => {
    const player = playlistPlayer();

    await player.playSnapshot(track, 'playlist', { contextRef: 'skyfi:pl-2', rollSeed: false });

    expect(extraOf()?.context_ref).toBe('skyfi:pl-2');
  });

  it('queue ref не трогает — в очереди живёт прежний контекст возврата', async () => {
    const player = playlistPlayer();

    await player.playSnapshot(track, 'queue', { rollSeed: false });

    expect(extraOf()).not.toHaveProperty('context_ref');
  });

  it('single/favorites/uploads шлют null — их ref всегда null', async () => {
    const player = playlistPlayer();

    await player.playSnapshot(track, 'single', { rollSeed: false });
    expect(extraOf()?.context_ref).toBeNull();
    await player.playSnapshot(track, 'favorites', { rollSeed: false });
    expect(extraOf()?.context_ref).toBeNull();
    await player.playSnapshot(track, 'uploads', { rollSeed: false });
    expect(extraOf()?.context_ref).toBeNull();
  });
});

describe('stores/player: резолвер контекста по паре источник+ref', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    const auth = useAuthStore();
    auth.user = { id: 1 } as never;
    useDevicesStore().myDeviceUuid = 'uuid-1';
  });

  function searchPage(query: string, page: number, tracks: TrackSnapshot[]): SearchPagePayload {
    const empty = { items: [], total: 0, has_more: false };
    return {
      query,
      page,
      best: null,
      tracks: { items: tracks, total: tracks.length, has_more: false },
      albums: empty,
      artists: empty,
      playlists: empty,
      videos: empty,
    };
  }

  function trackOf(id: string): TrackSnapshot {
    return { ...track, source_id: id };
  }

  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it('смена context_ref перечитывает контекст (плейлист А → плейлист Б)', async () => {
    const player = usePlayerStore();
    fetchSearchMock
      .mockResolvedValueOnce(searchPage('рок', 1, [trackOf('s1'), trackOf('s2')]) as never)
      .mockResolvedValueOnce(searchPage('джаз', 1, [trackOf('j1')]) as never);

    player.applyServerState(
      {
        state: {
          ...player.state,
          current_snapshot: trackOf('s1'),
          play_source: 'search',
          context_ref: 'рок',
          repeat_mode: 'all',
          version: 8,
        },
        queue: [],
      } as never,
      { force: true },
    );
    await flush();

    expect(fetchSearchMock).toHaveBeenCalledWith(expect.objectContaining({ q: 'рок' }));
    expect(player.previewNext?.source_id).toBe('s2');

    player.applyServerState(
      {
        state: {
          ...player.state,
          current_snapshot: trackOf('j1'),
          play_source: 'search',
          context_ref: 'джаз',
          repeat_mode: 'all',
          version: 9,
        },
        queue: [],
      } as never,
      { force: true },
    );
    await flush();

    expect(fetchSearchMock).toHaveBeenCalledTimes(2);
    expect(fetchSearchMock).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'джаз' }));
    // Контекст сменился (repeat=all): превью циклится по новому одноэлементному списку.
    expect(player.previewNext?.source_id).toBe('j1');
  });

  it('тот же источник и тот же ref — повторного запроса нет', async () => {
    const player = usePlayerStore();
    fetchSearchMock.mockResolvedValue(searchPage('рок', 1, [trackOf('s1')]) as never);

    const state = {
      ...player.state,
      current_snapshot: trackOf('s1'),
      play_source: 'search',
      context_ref: 'рок',
    };
    player.applyServerState({ state: { ...state, version: 8 }, queue: [] } as never, { force: true });
    await flush();
    player.applyServerState({ state: { ...state, version: 9, position_seconds: 5 }, queue: [] } as never, {
      force: true,
    });
    await flush();

    expect(fetchSearchMock).toHaveBeenCalledTimes(1);
  });
});


describe('stores/player: режим клипов — серверный clips_enabled', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    const auth = useAuthStore();
    auth.user = { id: 1 } as never;
    useDevicesStore().myDeviceUuid = 'uuid-1';
  });

  function activePlayer() {
    const player = usePlayerStore();
    player.state = {
      ...player.state,
      current_snapshot: track,
      is_playing: true,
      active_device_id: 'uuid-1',
      clips_enabled: false,
    };
    return player;
  }

  it('toggleClips: оптимистично включает и шлёт PATCH /options', async () => {
    const player = activePlayer();
    patchPlaybackOptionsMock.mockResolvedValue({
      state: { ...player.state, clips_enabled: true },
      queue: [],
    } as never);

    await player.toggleClips();

    expect(player.clipMode).toBe(true);
    expect(patchPlaybackOptionsMock).toHaveBeenCalledWith(
      { clips_enabled: true },
      { origin_device_id: 'uuid-1', command_id: expect.any(String) },
    );
    // Ответ применили — зеркало совпадает с сервером.
    expect(player.state.clips_enabled).toBe(true);
  });

  it('toggleClips: ошибка — откат флага и клипа, тост', async () => {
    const player = activePlayer();
    player.setClipResolved(track, clip, [{ quality: 720, url: 'https://cdn.test/720.mp4' }]);
    patchPlaybackOptionsMock.mockRejectedValue(new Error('offline'));

    await player.toggleClips();

    expect(player.clipMode).toBe(false);
    expect(player.clipStatus).toBe('idle');
    expect(useToastStore().toast?.error).toBe(true);
  });

  it('серверный стейт с чужим устройством зеркалит режим: включили — резолвим, выключили — чистим клип', async () => {
    const player = activePlayer();
    player.state = { ...player.state, active_device_id: 'uuid-2' };
    player.setClipResolved(track, clip, [{ quality: 720, url: 'https://cdn.test/720.mp4' }]);

    player.applyServerState(
      { state: { ...player.state, clips_enabled: true, version: 20 }, queue: [] } as never,
      { force: true },
    );
    expect(player.clipMode).toBe(true);
    expect(player.clipActive).toBe(true);

    player.applyServerState(
      { state: { ...player.state, clips_enabled: false, version: 21 }, queue: [] } as never,
      { force: true },
    );
    // Режим выключили на другом устройстве — клип снят, играем аудио трека.
    expect(player.clipMode).toBe(false);
    expect(player.clipStatus).toBe('idle');
    expect(player.effectiveCurrent?.source_id).toBe('t1');
  });

  it('reconnect активного: слияние по владению берёт clips_enabled с сервера', async () => {
    const player = activePlayer();
    player.setClipResolved(track, clip, [{ quality: 720, url: 'https://cdn.test/720.mp4' }]);

    player.applyServerState({ state: { ...player.state, clips_enabled: true, version: 8 }, queue: [] } as never, {
      force: true,
    });
    // Локальная жизнь: пока были офлайн, сами выключили клипы.
    player.clipMode = false;

    fetchPlayerStateMock.mockResolvedValue({
      state: { ...player.state, clips_enabled: true, version: 9, active_device_id: 'uuid-1' },
      queue: [],
    } as never);
    await player.resync();

    expect(player.clipMode).toBe(true);
    expect(player.state.clips_enabled).toBe(true);
  });

  it('мок-режим (гость): тоглим локально, API молчит', async () => {
    useAuthStore().user = null;
    const player = usePlayerStore();
    player.state = { ...player.state, clips_enabled: false };

    await player.toggleClips();

    expect(player.clipMode).toBe(true);
    expect(player.state.clips_enabled).toBe(true);
    expect(patchPlaybackOptionsMock).not.toHaveBeenCalled();
  });
});

describe('stores/player: офлайн', () => {
  const seekToMock = vi.mocked(playerApi.seekTo);

  beforeEach(() => {
    setActivePinia(createPinia());
    playSnapshotMock.mockReset();
    resumePlaybackMock.mockReset();
    pausePlaybackMock.mockReset();
    seekToMock.mockReset();
    const auth = useAuthStore();
    auth.user = { id: 1 } as never;
    auth.token = 't';
    useOnlineStore().isOnline = false;
  });

  it('нескачанный трек офлайн не запускается и не шлёт play', async () => {
    const player = usePlayerStore();

    await player.playSnapshot(track, 'single');

    expect(playSnapshotMock).not.toHaveBeenCalled();
    expect(player.state.current_snapshot).toBeNull();
    expect(player.state.is_playing).toBe(false);
    expect(useToastStore().toast).toBeNull();
  });

  it('play на уже «играющем» не шлёт resume', async () => {
    const player = usePlayerStore();
    player.state = { ...player.state, current_snapshot: track, is_playing: true };

    await player.togglePlay();

    expect(resumePlaybackMock).not.toHaveBeenCalled();
    expect(pausePlaybackMock).not.toHaveBeenCalled();
    expect(player.state.is_playing).toBe(true);
  });

  it('seek не уходит на сервер', async () => {
    vi.useFakeTimers();
    const player = usePlayerStore();
    player.state = { ...player.state, current_snapshot: track, is_playing: true, position_seconds: 1 };

    player.seek(12);
    await vi.advanceTimersByTimeAsync(400);

    expect(seekToMock).not.toHaveBeenCalled();
    expect(player.state.position_seconds).toBe(12);
    vi.useRealTimers();
  });
});
