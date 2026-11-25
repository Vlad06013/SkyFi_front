import axios from 'axios';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchAudioFile } from '@/api/audio';
import { fetchEntityDetails } from '@/api/details';
import { clearLocalCover, setLocalCover } from '@/lib/cover';
import {
  deleteCollectionRecord,
  deleteLinkRecord,
  deleteTrackRecord,
  loadDownloadDb,
  saveCollectionRecord,
  saveLinkRecord,
  saveTrackRecord,
  type CollectionRecord,
  type LinkRecord,
  type TrackRecord,
} from '@/lib/download-db';
import { openDownload, removeDownload, saveCoverFromUrl, writeDownload } from '@/lib/download-files';
import { coverFilePath, entityKey, isCollection, linkId, trackFilePath, type CollectionSnapshot } from '@/lib/download-keys';
import { useToastStore } from '@/stores/toast';
import type { AnySnapshot, TrackSnapshot } from '@/types';

export type BulkKind = 'tracks' | 'albums' | 'playlists';

const DETAILS_LIMIT = 50;

export function isDownloadAbort(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return axios.isAxiosError(error) && error.code === 'ERR_CANCELED';
}

function aborted(): never {
  throw new DOMException('aborted', 'AbortError');
}

function coverUrlOf(snapshot: AnySnapshot): string | null {
  if (snapshot.type === 'track') return snapshot.cover_url ?? snapshot.album?.cover_url ?? null;
  if (snapshot.type === 'video') return snapshot.cover_url;
  return snapshot.cover_url;
}

/** Скачанные треки, связи с альбомами/плейлистами и одна закачка «скачать всё». */
export const useDownloadsStore = defineStore('downloads', () => {
  const toast = useToastStore();
  const trackRows = ref<TrackRecord[]>([]);
  const collections = ref<CollectionRecord[]>([]);
  const links = ref<LinkRecord[]>([]);
  const bulk = ref<{ kind: BulkKind; total: number; done: number } | null>(null);
  /** Процент одного файла: loaded / Content-Length. К кнопке «скачать всё» не относится. */
  const filePct = ref<Record<string, number>>({});
  let bulkAbort: AbortController | null = null;
  const fileStops = new Set<AbortController>();
  const inflight = new Map<string, Promise<void>>();

  const items = computed(() =>
    [...trackRows.value]
      .sort((a, b) => b.downloadedAt - a.downloadedAt)
      .map((row) => row.snapshot),
  );

  const downloadedBytes = computed(() => trackRows.value.reduce((sum, row) => sum + row.bytes, 0));

  /** «Скачать всё»: сколько треков уже лежит / сколько всего в этой закачке. */
  const bulkPct = computed(() => {
    const job = bulk.value;
    if (!job?.total) return 0;
    return Math.min(100, Math.round((job.done / job.total) * 100));
  });

  function hasTrack(key: string) {
    return trackRows.value.some((row) => row.key === key);
  }

  function linkedCount(ownerKey: string) {
    return links.value.filter(
      (link) => link.ownerKey === ownerKey && trackRows.value.some((row) => row.key === link.trackKey),
    ).length;
  }

  function trackFilePct(sourceType: string, sourceId: string): number | null {
    const pct = filePct.value[`track:${sourceType}:${sourceId}`];
    return pct === undefined ? null : pct;
  }

  function isDownloaded(snapshot: AnySnapshot) {
    if (snapshot.type === 'track') return hasTrack(entityKey(snapshot));
    if (!isCollection(snapshot)) return false;
    const row = collections.value.find((item) => item.key === entityKey(snapshot));
    if (!row) return false;
    return linkedCount(row.key) >= row.total;
  }

  function cancelBulk() {
    bulkAbort?.abort();
    bulkAbort = null;
    bulk.value = null;
  }

  /** Обрыв и «скачать всё», и отдельного трека: кольцо на кнопке в этот момент крутится. */
  function cancelActive() {
    cancelBulk();
    for (const stop of fileStops) stop.abort();
    fileStops.clear();
  }

  function bindStop(parent: AbortSignal) {
    const stop = new AbortController();
    fileStops.add(stop);
    const fromParent = () => stop.abort();
    if (parent.aborted) stop.abort();
    else parent.addEventListener('abort', fromParent);
    stop.signal.addEventListener('abort', () => {
      fileStops.delete(stop);
      parent.removeEventListener('abort', fromParent);
    });
    return stop.signal;
  }

  function beginBulk(kind: BulkKind) {
    cancelBulk();
    const controller = new AbortController();
    bulkAbort = controller;
    bulk.value = { kind, total: 0, done: 0 };
    return controller;
  }

  function endBulk(controller: AbortController) {
    if (bulkAbort !== controller) return;
    bulkAbort = null;
    bulk.value = null;
  }

  function addTotal(count: number) {
    if (!bulk.value || count <= 0) return;
    bulk.value = { ...bulk.value, total: bulk.value.total + count };
  }

  function markBytes(key: string, loaded: number, total: number) {
    const pct = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
    filePct.value = { ...filePct.value, [key]: pct };
  }

  function clearBytes(key: string) {
    if (!(key in filePct.value)) return;
    const next = { ...filePct.value };
    delete next[key];
    filePct.value = next;
  }

  function finishFile() {
    if (!bulk.value) return;
    bulk.value = { ...bulk.value, done: bulk.value.done + 1 };
  }

  async function publishCover(key: string, path: string, mime: string) {
    const src = await openDownload(path, mime);
    if (src) setLocalCover(key, src);
  }

  async function ensureCover(snapshot: AnySnapshot, signal: AbortSignal) {
    const url = coverUrlOf(snapshot);
    if (!url) return;
    const key = entityKey(snapshot);
    const track = trackRows.value.find((row) => row.key === key);
    const collection = collections.value.find((row) => row.key === key);
    const existing = track?.coverPath ?? collection?.coverPath;
    const mime = track?.coverMime ?? collection?.coverMime ?? 'image/jpeg';
    if (existing) {
      await publishCover(key, existing, mime);
      return;
    }
    let saved: string | null = null;
    try {
      saved = await saveCoverFromUrl(url, coverFilePath(snapshot), signal);
    } catch (error) {
      if (isDownloadAbort(error) || signal.aborted) throw error;
      return;
    }
    if (!saved) return;
    const path = coverFilePath(snapshot);
    if (track) {
      const next = { ...track, coverPath: path, coverMime: saved };
      trackRows.value = trackRows.value.map((row) => (row.key === key ? next : row));
      await saveTrackRecord(next);
    } else if (collection) {
      const next = { ...collection, coverPath: path, coverMime: saved };
      collections.value = collections.value.map((row) => (row.key === key ? next : row));
      await saveCollectionRecord(next);
    }
    await publishCover(key, path, saved);
  }

  async function storeFile(snapshot: TrackSnapshot, signal: AbortSignal) {
    const key = entityKey(snapshot);
    if (hasTrack(key)) return;
    const pending = inflight.get(key);
    if (pending) {
      await pending;
      return;
    }
    const job = (async () => {
      markBytes(key, 0, 0);
      const fileSignal = bindStop(signal);
      const bytes = await fetchAudioFile(snapshot, fileSignal, (loaded, total) => markBytes(key, loaded, total));
      if (fileSignal.aborted) aborted();
      const path = trackFilePath(snapshot);
      await writeDownload(path, bytes, 'audio/mpeg');
      const row: TrackRecord = {
        key,
        snapshot,
        path,
        bytes: bytes.byteLength,
        coverPath: null,
        coverMime: null,
        downloadedAt: Date.now(),
      };
      trackRows.value = [row, ...trackRows.value.filter((item) => item.key !== key)];
      await saveTrackRecord(row);
      clearBytes(key);
    })().finally(() => {
      inflight.delete(key);
      clearBytes(key);
    });
    inflight.set(key, job);
    await job;
  }

  async function addLink(trackKey: string, ownerKey: string) {
    const id = linkId(trackKey, ownerKey);
    if (links.value.some((link) => link.id === id)) return;
    const row: LinkRecord = { id, trackKey, ownerKey };
    links.value = [...links.value, row];
    await saveLinkRecord(row);
  }

  async function saveTrack(snapshot: TrackSnapshot, ownerKey: string, signal: AbortSignal, report: boolean) {
    if (signal.aborted) aborted();
    await storeFile(snapshot, signal);
    await addLink(entityKey(snapshot), ownerKey);
    await ensureCover(snapshot, signal);
    if (report) finishFile();
  }

  async function listTracks(snapshot: CollectionSnapshot, signal: AbortSignal) {
    const tracks: TrackSnapshot[] = [];
    let entity: CollectionSnapshot = snapshot;
    for (let page = 1; page < 100; page += 1) {
      if (signal.aborted) aborted();
      const payload = await fetchEntityDetails(
        { type: snapshot.type, source_type: snapshot.source_type, source_id: snapshot.source_id },
        { page, limit: DETAILS_LIMIT },
        signal,
      );
      if (payload.entity.type === 'album' || payload.entity.type === 'playlist') entity = payload.entity;
      const pageTracks = payload.tracks.items.filter((item): item is TrackSnapshot => item.type === 'track');
      if (pageTracks.length === 0) break;
      tracks.push(...pageTracks);
      if (pageTracks.length < DETAILS_LIMIT) break;
    }
    return { entity, tracks };
  }

  async function rememberCollection(row: CollectionRecord) {
    collections.value = [...collections.value.filter((item) => item.key !== row.key), row];
    await saveCollectionRecord(row);
  }

  async function runCollection(snapshot: CollectionSnapshot, signal: AbortSignal, report: boolean) {
    const listed = await listTracks(snapshot, signal);
    const key = entityKey(listed.entity);
    const prev = collections.value.find((item) => item.key === key);
    await rememberCollection({
      key,
      snapshot: listed.entity,
      total: listed.tracks.length,
      coverPath: prev?.coverPath ?? null,
      coverMime: prev?.coverMime ?? null,
    });
    if (report) addTotal(listed.tracks.length);
    await ensureCover(listed.entity, signal);
    let failed = false;
    for (const track of listed.tracks) {
      if (signal.aborted) aborted();
      try {
        await saveTrack(track, key, signal, report);
      } catch (error) {
        if (isDownloadAbort(error) || signal.aborted) throw error;
        failed = true;
      }
    }
    return failed;
  }

  async function downloadTrack(snapshot: TrackSnapshot) {
    await saveTrack(snapshot, entityKey(snapshot), new AbortController().signal, false);
  }

  async function downloadCollection(snapshot: CollectionSnapshot) {
    const controller = beginBulk(snapshot.type === 'album' ? 'albums' : 'playlists');
    try {
      const failed = await runCollection(snapshot, controller.signal, true);
      if (failed) throw new Error('не все треки скачались');
    } finally {
      endBulk(controller);
    }
  }

  async function downloadAllTracks(list: TrackSnapshot[]) {
    const controller = beginBulk('tracks');
    try {
      addTotal(list.length);
      let failed = false;
      for (const track of list) {
        if (controller.signal.aborted) return;
        try {
          await saveTrack(track, entityKey(track), controller.signal, true);
        } catch (error) {
          if (isDownloadAbort(error) || controller.signal.aborted) return;
          failed = true;
        }
      }
      if (failed) toast.show('Скачивание', 'не все треки скачались', true);
    } finally {
      endBulk(controller);
    }
  }

  async function downloadAllCollections(kind: 'albums' | 'playlists', list: CollectionSnapshot[]) {
    const controller = beginBulk(kind);
    try {
      let failed = false;
      for (const item of list) {
        if (controller.signal.aborted) return;
        try {
          if (await runCollection(item, controller.signal, true)) failed = true;
        } catch (error) {
          if (isDownloadAbort(error) || controller.signal.aborted) return;
          failed = true;
        }
      }
      if (failed) toast.show('Скачивание', 'не все треки скачались', true);
    } finally {
      endBulk(controller);
    }
  }

  async function clearDownloads() {
    cancelActive();
    const tracks = [...trackRows.value];
    const owned = [...collections.value];
    const linkIds = links.value.map((link) => link.id);
    trackRows.value = [];
    collections.value = [];
    links.value = [];
    filePct.value = {};
    await Promise.all([
      ...linkIds.map((id) => deleteLinkRecord(id)),
      ...tracks.map((row) => deleteTrackRecord(row.key)),
      ...owned.map((row) => deleteCollectionRecord(row.key)),
      ...tracks.map((row) => removeDownload(row.path)),
      ...tracks.filter((row) => row.coverPath).map((row) => removeDownload(row.coverPath!)),
      ...owned.filter((row) => row.coverPath).map((row) => removeDownload(row.coverPath!)),
    ]);
    for (const row of tracks) clearLocalCover(row.key);
    for (const row of owned) clearLocalCover(row.key);
  }

  async function removeTrack(snapshot: AnySnapshot) {
    if (snapshot.type !== 'track') return;
    const key = entityKey(snapshot);
    const row = trackRows.value.find((item) => item.key === key);
    const owned = links.value.filter((link) => link.trackKey === key);
    links.value = links.value.filter((link) => link.trackKey !== key);
    trackRows.value = trackRows.value.filter((item) => item.key !== key);
    await Promise.all(owned.map((link) => deleteLinkRecord(link.id)));
    await deleteTrackRecord(key);
    if (row) {
      await removeDownload(row.path);
      if (row.coverPath) await removeDownload(row.coverPath);
    }
    clearLocalCover(key);
  }

  async function removeCollection(snapshot: AnySnapshot) {
    if (!isCollection(snapshot)) return;
    const key = entityKey(snapshot);
    const owned = links.value.filter((link) => link.ownerKey === key);
    links.value = links.value.filter((link) => link.ownerKey !== key);
    const row = collections.value.find((item) => item.key === key);
    collections.value = collections.value.filter((item) => item.key !== key);
    await Promise.all(owned.map((link) => deleteLinkRecord(link.id)));
    await deleteCollectionRecord(key);
    if (row?.coverPath) await removeDownload(row.coverPath);
    clearLocalCover(key);
    for (const link of owned) {
      if (links.value.some((item) => item.trackKey === link.trackKey)) continue;
      const track = trackRows.value.find((item) => item.key === link.trackKey);
      if (track) await removeTrack(track.snapshot);
    }
  }

  async function localUrl(snapshot: TrackSnapshot) {
    const row = trackRows.value.find((item) => item.key === entityKey(snapshot));
    if (!row) return null;
    return openDownload(row.path, 'audio/mpeg');
  }

  async function hydrate() {
    try {
      const data = await loadDownloadDb();
      trackRows.value = data.tracks;
      collections.value = data.collections;
      links.value = data.links;
      for (const row of data.tracks) {
        if (row.coverPath) await publishCover(row.key, row.coverPath, row.coverMime || 'image/jpeg');
      }
      for (const row of data.collections) {
        if (row.coverPath) await publishCover(row.key, row.coverPath, row.coverMime || 'image/jpeg');
      }
    } catch {
      trackRows.value = [];
      collections.value = [];
      links.value = [];
    }
  }

  return {
    items,
    downloadedBytes,
    bulk,
    bulkPct,
    filePct,
    trackFilePct,
    isDownloaded,
    hydrate,
    downloadTrack,
    downloadCollection,
    downloadAllTracks,
    downloadAllCollections,
    cancelBulk,
    cancelActive,
    removeTrack,
    removeCollection,
    clearDownloads,
    localUrl,
  };
});
