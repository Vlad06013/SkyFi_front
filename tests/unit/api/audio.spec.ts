import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosRequestConfig } from 'axios';
import { http } from '@/api/http';
import { AUDIO_STALL_TIMEOUT_MS, fetchAudioFile } from '@/api/audio';
import type { TrackSnapshot } from '@/types';

vi.mock('@/api/http', () => ({
  http: {
    post: vi.fn(),
    postBytes: vi.fn(),
  },
}));

const postBytesMock = vi.mocked(http.postBytes);

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

/** Запрос, который молчит, пока его не оборвут по signal (сталл стрима). */
function hangingRequest(_url: string, _data?: unknown, config?: AxiosRequestConfig) {
  return new Promise<ArrayBuffer>((_resolve, reject) => {
    config?.signal?.addEventListener('abort', () =>
      reject(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' })),
    );
  });
}

describe('api/audio: fetchAudioFile', () => {
  beforeEach(() => {
    postBytesMock.mockReset();
  });

  it('сталл стрима — обрыв по таймауту и одна повторная попытка', async () => {
    vi.useFakeTimers();
    try {
      postBytesMock.mockImplementationOnce(hangingRequest).mockResolvedValueOnce(new ArrayBuffer(8));

      const promise = fetchAudioFile(track);
      await vi.advanceTimersByTimeAsync(AUDIO_STALL_TIMEOUT_MS + 100);

      await expect(promise).resolves.toBeInstanceOf(ArrayBuffer);
      expect(postBytesMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('два сталла подряд — честная ошибка, а не вечные 66%', async () => {
    vi.useFakeTimers();
    try {
      postBytesMock.mockImplementation(hangingRequest);

      const promise = fetchAudioFile(track);
      const assertion = expect(promise).rejects.toThrow('перестал отдавать файл');
      await vi.advanceTimersByTimeAsync(AUDIO_STALL_TIMEOUT_MS * 2 + 200);

      await assertion;
      expect(postBytesMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('отмена пользователем — без повторной попытки', async () => {
    postBytesMock.mockImplementation(hangingRequest);
    const user = new AbortController();

    const promise = fetchAudioFile(track, user.signal);
    user.abort();

    await expect(promise).rejects.toThrow();
    expect(postBytesMock).toHaveBeenCalledTimes(1);
  });

  it('живой прогресс сбрасывает сталл-таймер — длинная закачка не рвётся', async () => {
    vi.useFakeTimers();
    try {
      postBytesMock.mockImplementationOnce(
        (_url: string, _data?: unknown, config?: AxiosRequestConfig) =>
          new Promise<ArrayBuffer>((resolve) => {
            let loaded = 0;
            const pump = setInterval(() => {
              loaded += 1;
              config?.onDownloadProgress?.({ loaded, total: 100 } as never);
              if (loaded >= 4) {
                clearInterval(pump);
                resolve(new ArrayBuffer(8));
              }
            }, 20_000);
          }),
      );

      const promise = fetchAudioFile(track);
      // 80 с суммарно — больше сталл-таймаута, но байты текут каждые 20 с.
      await vi.advanceTimersByTimeAsync(90_000);

      await expect(promise).resolves.toBeInstanceOf(ArrayBuffer);
      expect(postBytesMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
