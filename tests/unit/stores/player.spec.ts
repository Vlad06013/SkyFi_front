import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import * as playerApi from '@/api/player';
import * as queueApi from '@/api/queue';
import { useAuthStore } from '@/stores/auth';
import { useDevicesStore } from '@/stores/devices';
import { usePlayerStore } from '@/stores/player';
import { useToastStore } from '@/stores/toast';
import type { QueueItem, TrackSnapshot, VideoSnapshot } from '@/types';

vi.mock('@/api/queue', () => ({
  fetchQueue: vi.fn(),
  addToQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderPending: vi.fn(),
}));

vi.mock('@/api/player', () => ({
  fetchPlayerState: vi.fn(),
  playSnapshot: vi.fn(),
  pausePlayback: vi.fn(),
  resumePlayback: vi.fn(),
  seekTo: vi.fn(),
  patchPlaybackOptions: vi.fn(),
}));

const fetchQueueMock = vi.mocked(queueApi.fetchQueue);
const addToQueueMock = vi.mocked(queueApi.addToQueue);
const removeFromQueueMock = vi.mocked(queueApi.removeFromQueue);
const reorderPendingMock = vi.mocked(queueApi.reorderPending);
const pausePlaybackMock = vi.mocked(playerApi.pausePlayback);
const playSnapshotMock = vi.mocked(playerApi.playSnapshot);

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
