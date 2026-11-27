import { ref } from 'vue';

/** Секунда под курсором прогресса. null — окошко спрятано. */
export const scrubSeconds = ref<number | null>(null);

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function showScrub(seconds: number) {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  scrubSeconds.value = Math.max(0, seconds);
}

export function scheduleHideScrub(ms = 600) {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    hideTimer = null;
    scrubSeconds.value = null;
  }, ms);
}

export function hideScrub() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  scrubSeconds.value = null;
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
