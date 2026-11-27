import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope } from 'vue';
import * as playerApi from '@/api/player';
import * as audioApi from '@/api/audio';
import * as videosApi from '@/api/videos';
import { useAudioPlayback } from '@/composables/useAudioPlayback';
import { useVideoPlayback } from '@/composables/useVideoPlayback';
import { useAuthStore } from '@/stores/auth';
import { useDevicesStore } from '@/stores/devices';
import { usePlayerStore } from '@/stores/player';
import type { TrackSnapshot, VideoSnapshot } from '@/types';

vi.mock('@/api/player', () => ({
  fetchPlayerState: vi.fn(),
  playSnapshot: vi.fn(),
  pausePlayback: vi.fn(),
  resumePlayback: vi.fn(),
  seekTo: vi.fn(),
  patchPlaybackOptions: vi.fn(),
}));

vi.mock('@/api/queue', () => ({
  fetchQueue: vi.fn(),
  addToQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  movePending: vi.fn(),
}));

vi.mock('@/api/search', () => ({
  fetchSearch: vi.fn(),
  fetchSearchV2: vi.fn(),
}));

vi.mock('@/api/videos', () => ({
  fetchVideoStreams: vi.fn(),
  resolveVideo: vi.fn(),
}));

vi.mock('@/api/audio', () => ({
  fetchAudioUrl: vi.fn(),
}));

vi.mock('@/lib/hls-engine', () => ({
  hlsDetach: vi.fn(),
  hlsLoad: vi.fn(async () => true),
  hlsResume: vi.fn(),
  hlsSetAudioTrack: vi.fn(),
  hlsSetQuality: vi.fn(),
  hlsStatus: vi.fn(() => ({})),
  hlsSupported: vi.fn(async () => false),
  setHlsHooks: vi.fn(),
}));

const playSnapshotMock = vi.mocked(playerApi.playSnapshot);
const pausePlaybackMock = vi.mocked(playerApi.pausePlayback);
const resumePlaybackMock = vi.mocked(playerApi.resumePlayback);
const patchPlaybackOptionsMock = vi.mocked(playerApi.patchPlaybackOptions);
const fetchVideoStreamsMock = vi.mocked(videosApi.fetchVideoStreams);
const resolveVideoMock = vi.mocked(videosApi.resolveVideo);
const fetchAudioUrlMock = vi.mocked(audioApi.fetchAudioUrl);

const track: TrackSnapshot = {
  type: 'track',
  source_type: 'yandex_music',
  source_id: 't1',
  title: 'трек',
  artists: [{ name: 'артист' }],
  duration_ms: 200000,
  cover_url: null,
  album: null,
  stream_url: null,
};

const video: VideoSnapshot = {
  type: 'video',
  source_type: 'youtube',
  source_id: 'v1',
  title: 'ролик',
  artists: [{ name: 'канал' }],
  duration_ms: 150000,
  cover_url: null,
  watch_url: null,
};

describe('useVideoPlayback: транспорт чистого видео', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    // jsdom не играет медиа: play/pause заменяем на честные события элемента.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play'));
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('pause'));
    });
    // jsdom не реализует load() — движки зовут его при снятии src.
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    vi.stubGlobal('requestAnimationFrame', () => 0);

    const auth = useAuthStore();
    auth.user = { id: 1 } as never;
    const devices = useDevicesStore();
    devices.myDeviceUuid = 'uuid-1';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function serverState(player: ReturnType<typeof usePlayerStore>, isPlaying: boolean) {
    return {
      state: {
        ...player.state,
        // Как ответ бэка: каждый раз свежий JSON, не ссылка на прошлый объект.
        current_snapshot: { ...video, artists: video.artists.map((artist) => ({ ...artist })) },
        is_playing: isPlaying,
        active_device_id: 'uuid-1',
      },
      queue: [],
    } as never;
  }

  it('пауза после resume уходит на бэк', async () => {
    const scope = effectScope();
    const player = usePlayerStore();
    player.state = { ...player.state, active_device_id: 'uuid-1' };
    // Оба движка, как в main.ts: аудио-глушение на видео не должно
    // гасить флаг звучания видео-элемента.
    scope.run(() => {
      useAudioPlayback();
      useVideoPlayback();
    });

    playSnapshotMock.mockResolvedValue(serverState(player, true));
    fetchVideoStreamsMock.mockResolvedValue({
      streams: [{ quality: 720, url: 'https://cdn.test/v.mp4' }],
      hls: null,
      ttl_sec: 300,
    } as never);

    await player.playSnapshot(video, 'search');
    await vi.advanceTimersByTimeAsync(0);
    expect(player.audioPlaying).toBe(true);

    // стоп
    await vi.advanceTimersByTimeAsync(500);
    pausePlaybackMock.mockResolvedValue(serverState(player, false));
    await player.togglePlay();
    await vi.advanceTimersByTimeAsync(0);
    expect(pausePlaybackMock).toHaveBeenCalledTimes(1);
    expect(player.audioPlaying).toBe(false);

    // плей
    await vi.advanceTimersByTimeAsync(500);
    resumePlaybackMock.mockResolvedValue(serverState(player, true));
    await player.togglePlay();
    await vi.advanceTimersByTimeAsync(0);
    expect(resumePlaybackMock).toHaveBeenCalledTimes(1);
    expect(player.audioPlaying).toBe(true);

    // повторный стоп
    await vi.advanceTimersByTimeAsync(500);
    pausePlaybackMock.mockResolvedValue(serverState(player, false));
    await player.togglePlay();
    await vi.advanceTimersByTimeAsync(0);

    expect(pausePlaybackMock).toHaveBeenCalledTimes(2);
    expect(player.state.is_playing).toBe(false);
  });

  it('подмена трека клипом гасит флаг звучания аудио-элемента', async () => {
    const scope = effectScope();
    const player = usePlayerStore();
    player.state = { ...player.state, active_device_id: 'uuid-1' };
    scope.run(() => {
      useAudioPlayback();
      useVideoPlayback();
    });

    // Трек играет через аудио-движок.
    playSnapshotMock.mockResolvedValue({
      state: { ...player.state, current_snapshot: { ...track }, is_playing: true, active_device_id: 'uuid-1' },
      queue: [],
    } as never);
    fetchAudioUrlMock.mockResolvedValue({ url: 'https://cdn.test/t.mp3', ttlSec: 300 } as never);
    await player.playSnapshot(track);
    await vi.advanceTimersByTimeAsync(0);
    expect(player.audioPlaying).toBe(true);

    // Клип подменяет трек; поток клипа ещё не приехал (streams пустые) —
    // флаг обязан погасить аудио-движок: pause его элемент уже не опознает
    // (эффективный снапшот — видео).
    patchPlaybackOptionsMock.mockResolvedValue({
      state: {
        ...player.state,
        current_snapshot: { ...track },
        is_playing: true,
        active_device_id: 'uuid-1',
        clips_enabled: true,
      },
      queue: [],
    } as never);
    resolveVideoMock.mockResolvedValue({ video: { ...video }, streams: [], ttl_sec: 300 } as never);
    fetchVideoStreamsMock.mockResolvedValue({ streams: [], hls: null, ttl_sec: 300 } as never);

    await player.toggleClips();
    await vi.advanceTimersByTimeAsync(0);

    expect(player.clipActive).toBe(true);
    expect(player.audioPlaying).toBe(false);
  });

  it('пульт не тянет потоки чистого видео; активация подхватывает поток', async () => {
    const scope = effectScope();
    const player = usePlayerStore();
    player.state = { ...player.state, active_device_id: 'uuid-2' };
    scope.run(() => {
      useAudioPlayback();
      useVideoPlayback();
    });
    // Свой id и URL: кеши потоков/резолва и src элемента-синглтона живут между тестами.
    const pultVideo: VideoSnapshot = { ...video, source_id: 'v-pult' };
    fetchVideoStreamsMock.mockResolvedValue({
      streams: [{ quality: 720, url: 'https://cdn.test/v-pult.mp4' }],
      hls: null,
      ttl_sec: 300,
    } as never);

    // Сервер: видео играет на другом устройстве — мы пульт.
    player.applyServerState(
      {
        state: {
          ...player.state,
          current_snapshot: { ...pultVideo },
          is_playing: true,
          active_device_id: 'uuid-2',
        },
        queue: [],
      } as never,
      { force: true },
    );
    await vi.advanceTimersByTimeAsync(0);

    // Пульт показывает обложку: клип «активен» для UI, но get-url не зовём.
    expect(player.clipActive).toBe(true);
    expect(fetchVideoStreamsMock).not.toHaveBeenCalled();
    expect(player.audioPlaying).toBe(false);

    // «Играть здесь»: устройство стало активным — поток поднялся и заиграл.
    player.state = { ...player.state, active_device_id: 'uuid-1' };
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchVideoStreamsMock).toHaveBeenCalledTimes(1);
    expect(player.audioPlaying).toBe(true);
  });

  it('пульт резолвит клип ради названия, но поток не тянет', async () => {
    const scope = effectScope();
    const player = usePlayerStore();
    player.state = { ...player.state, active_device_id: 'uuid-2' };
    scope.run(() => {
      useAudioPlayback();
      useVideoPlayback();
    });
    const pultTrack: TrackSnapshot = { ...track, source_id: 't-pult' };
    resolveVideoMock.mockResolvedValue({
      video: { ...video, source_id: 'v-pult-clip' },
      streams: [{ quality: 720, url: 'https://cdn.test/v.mp4' }],
      ttl_sec: 300,
    } as never);

    player.applyServerState(
      {
        state: {
          ...player.state,
          current_snapshot: { ...pultTrack },
          is_playing: true,
          active_device_id: 'uuid-2',
          clips_enabled: true,
        },
        queue: [],
      } as never,
      { force: true },
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(resolveVideoMock).toHaveBeenCalledTimes(1);
    expect(player.clipActive).toBe(true);
    expect(fetchVideoStreamsMock).not.toHaveBeenCalled();
    expect(player.audioPlaying).toBe(false);
  });
});
