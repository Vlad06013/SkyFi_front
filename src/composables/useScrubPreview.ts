import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type Hls from 'hls.js';
import { getClipVideoElement } from '@/composables/useVideoPlayback';
import { resolveUrl } from '@/lib/endpoints';
import { scrubSeconds } from '@/lib/scrub-preview';
import { usePlayerStore } from '@/stores/player';

/**
 * Кадр под курсором прогресса. Прогрессивный файл крутит второй video,
 * HLS — отдельный лёгкий плеер на низкой ступени, основной ролик не трогаем.
 */
export function useScrubPreview(videoRef: Ref<HTMLVideoElement | null>) {
  const player = usePlayerStore();
  let hls: Hls | null = null;
  let attached = '';
  let want = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dropTimer: ReturnType<typeof setTimeout> | null = null;

  function source(): { hls: string; file: string } {
    const manifest = player.clipHls?.manifest_url ? resolveUrl(player.clipHls.manifest_url) : '';
    const src = getClipVideoElement()?.currentSrc ?? '';
    const file = src.startsWith('http') ? src : '';
    return { hls: manifest, file };
  }

  async function attach(el: HTMLVideoElement, url: { hls: string; file: string }) {
    const key = url.hls || url.file;
    if (!key || attached === key) return;
    hls?.destroy();
    hls = null;
    attached = key;
    el.pause();
    el.muted = true;
    if (url.hls) {
      const { default: HlsCtor } = await import('hls.js');
      if (!HlsCtor.isSupported()) {
        if (!url.file) return;
        el.src = url.file;
        return;
      }
      const created = new HlsCtor({
        maxBufferLength: 2,
        maxMaxBufferLength: 4,
        startLevel: 0,
        capLevelToPlayerSize: true,
        startPosition: want,
      });
      created.loadSource(url.hls);
      created.attachMedia(el);
      hls = created;
      return;
    }
    el.src = url.file;
  }

  function seekTo(el: HTMLVideoElement, seconds: number) {
    const apply = () => {
      if (Math.abs(el.currentTime - seconds) < 0.4) return;
      try {
        el.currentTime = seconds;
      } catch {
        /* метаданные ещё не приехали */
      }
    };
    if (el.readyState >= 1) apply();
    else el.addEventListener('loadedmetadata', apply, { once: true });
  }

  function sync(seconds: number) {
    const el = videoRef.value;
    if (!el) return;
    want = seconds;
    const url = source();
    if (!url.hls && !url.file) return;
    void attach(el, url).then(() => {
      if (videoRef.value) seekTo(videoRef.value, want);
    });
  }

  watch(videoRef, (el) => {
    if (el && scrubSeconds.value != null) sync(scrubSeconds.value);
  });

  watch(scrubSeconds, (seconds) => {
    if (dropTimer) {
      clearTimeout(dropTimer);
      dropTimer = null;
    }
    if (seconds == null) {
      dropTimer = setTimeout(() => {
        hls?.destroy();
        hls = null;
        attached = '';
        const el = videoRef.value;
        if (el) el.removeAttribute('src');
      }, 8000);
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => sync(seconds), 90);
  });

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
    if (dropTimer) clearTimeout(dropTimer);
    hls?.destroy();
  });

  return { scrubSeconds };
}

export function scrubStyle(ratio: number, bar: HTMLElement | null, root: HTMLElement | null) {
  if (!bar || !root) return { left: '50%', top: '40%' };
  const box = bar.getBoundingClientRect();
  const host = root.getBoundingClientRect();
  const half = 84;
  const raw = box.left - host.left + Math.min(1, Math.max(0, ratio)) * box.width;
  const left = Math.min(host.width - half - 12, Math.max(half + 12, raw));
  const top = box.top - host.top - 10;
  return { left: `${left}px`, top: `${top}px` };
}
