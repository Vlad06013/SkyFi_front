import { http } from '@/api/http';
import type { TrackSnapshot, UploadPatch } from '@/types';

/** Список своих загрузок (api.md §15). */
export function fetchUploads() {
  return http.get<TrackSnapshot[]>('uploads');
}

/** multipart: файл + мета; artist_names уходит массивом. */
export function uploadTrack(
  file: File,
  meta: { title: string; artistNames: string[]; albumTitle?: string },
) {
  const form = new FormData();
  form.append('audio', file);
  form.append('title', meta.title);
  for (const name of meta.artistNames) {
    form.append('artist_names[]', name);
  }
  if (meta.albumTitle) {
    form.append('album_title', meta.albumTitle);
  }
  return http.post<TrackSnapshot>('uploads', form);
}

/** Мета загрузки: title, artist_names, album_title, lyrics, visibility. */
export function updateUpload(id: string, patch: UploadPatch) {
  return http.patch<TrackSnapshot>(`uploads/${id}`, patch);
}

export function deleteUpload(id: string) {
  return http.delete<{ message: string }>(`uploads/${id}`);
}
