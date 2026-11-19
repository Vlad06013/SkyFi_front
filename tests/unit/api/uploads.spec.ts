import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from '@/api/http';
import { deleteUpload, fetchUploads, updateUpload, uploadTrack } from '@/api/uploads';
import type { TrackSnapshot } from '@/types';

vi.mock('@/api/http', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const getMock = vi.mocked(http.get);
const postMock = vi.mocked(http.post);
const patchMock = vi.mocked(http.patch);
const deleteMock = vi.mocked(http.delete);

const snapshot: TrackSnapshot = {
  type: 'track',
  source_type: 'upload',
  source_id: 'up-1',
  title: 'Полковнику никто не пишет',
  artists: [{ name: 'Би-2' }],
  duration_ms: null,
  cover_url: null,
  album: null,
  stream_url: null,
};

describe('api/uploads', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
  });

  it('GET /uploads — список своих загрузок', async () => {
    getMock.mockResolvedValue([snapshot]);
    await expect(fetchUploads()).resolves.toEqual([snapshot]);
    expect(getMock).toHaveBeenCalledWith('uploads');
  });

  it('POST /uploads — multipart с файлом и artist_names массивом', async () => {
    const file = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });
    postMock.mockResolvedValue(snapshot);
    await expect(
      uploadTrack(file, { title: 'Полковнику', artistNames: ['Би-2'], albumTitle: 'Мяу кисс ми' }),
    ).resolves.toEqual(snapshot);

    const [url, body] = postMock.mock.calls[0] ?? [];
    expect(url).toBe('uploads');
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get('audio')).toBe(file);
    expect(form.get('title')).toBe('Полковнику');
    expect(form.getAll('artist_names[]')).toEqual(['Би-2']);
    expect(form.get('album_title')).toBe('Мяу кисс ми');
  });

  it('POST /uploads — без album_title поле не шлём', async () => {
    const file = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });
    postMock.mockResolvedValue(snapshot);
    await uploadTrack(file, { title: 'Полковнику', artistNames: [] });
    const form = postMock.mock.calls[0]?.[1] as FormData;
    expect(form.get('album_title')).toBeNull();
  });

  it('PATCH /uploads/{id} — мета', async () => {
    patchMock.mockResolvedValue(snapshot);
    await updateUpload('up-1', { title: 'Новое имя', visibility: 'friends' });
    expect(patchMock).toHaveBeenCalledWith('uploads/up-1', {
      title: 'Новое имя',
      visibility: 'friends',
    });
  });

  it('DELETE /uploads/{id}', async () => {
    deleteMock.mockResolvedValue({ message: 'ok' });
    await deleteUpload('up-1');
    expect(deleteMock).toHaveBeenCalledWith('uploads/up-1');
  });
});
