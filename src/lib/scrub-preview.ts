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
