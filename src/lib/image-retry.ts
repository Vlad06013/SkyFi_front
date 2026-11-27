import { watch } from 'vue';
import { useOnlineStore } from '@/stores/online';

/**
 * Ретрай картинок после офлайна: img, упавшая без сети, сама не
 * перезагружается — src не менялся, и браузер запрос не повторяет.
 * Из-за этого после возврата сети обложка оставалась битой в мини-плеере
 * и на главной, пока экран не пересоздаст элемент (баг 12). Ошибки ловим
 * capture-фазой (error не всплывает), на офлайн→онлайн пересаживаем src —
 * элемент догружает картинку без пересоздания.
 */

const failed = new Set<HTMLImageElement>();
/** Страховка от разрастания, если сеть флапает, а картинок много. */
const FAILED_CAP = 300;

function onError(event: Event) {
  const el = event.target;
  if (!(el instanceof HTMLImageElement)) return;
  if (failed.size >= FAILED_CAP) failed.clear();
  failed.add(el);
}

function onLoad(event: Event) {
  if (event.target instanceof HTMLImageElement) failed.delete(event.target);
}

function retryFailed() {
  const imgs = [...failed];
  failed.clear();
  for (const el of imgs) {
    if (!el.isConnected) continue;
    const src = el.currentSrc || el.src;
    if (!src) continue;
    el.src = src;
  }
}

export function bindImageRetry() {
  document.addEventListener('error', onError, true);
  document.addEventListener('load', onLoad, true);
  watch(
    () => useOnlineStore().isOnline,
    (online, prev) => {
      if (online === true && prev === false) retryFailed();
    },
  );
}
