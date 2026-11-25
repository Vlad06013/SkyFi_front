/**
 * Автоплей после await (get-url) браузер режет: жест клика к этому моменту
 * уже кончился. Успешный play() любого медиа внутри жеста снимает запрет
 * на документ — дальше видео/аудио стартует со звуком уже после сети.
 * Короткий немой wav, тот же клик, до первого await.
 */

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

let unlocked = false;
let pending: Promise<void> | null = null;
/** play() отклонил автоплей: повторные canplay не должны снова включать спиннер. */
let autoplayBlocked = false;

export function isAutoplayBlocked(): boolean {
  return autoplayBlocked;
}

export function markAutoplayBlocked(): void {
  autoplayBlocked = true;
}

/** Звать синхронно из обработчика тапа, до любого await. */
export function unlockMediaPlayback(): void {
  autoplayBlocked = false;
  if (unlocked || pending) return;
  // jsdom: play() кидает Not implemented и пишет в консоль. В браузере — нет.
  if (import.meta.env.VITEST) return;
  if (typeof Audio === 'undefined') return;
  try {
    const probe = new Audio();
    probe.src = SILENT_WAV;
    const started = probe.play();
    if (!started || typeof started.then !== 'function') {
      unlocked = true;
      return;
    }
    pending = started
      .then(() => {
        unlocked = true;
        probe.pause();
        probe.removeAttribute('src');
      })
      .catch(() => undefined)
      .finally(() => {
        pending = null;
      });
  } catch {
    /* jsdom и старые WebView без Audio.play */
  }
}

/** play() целевого элемента — после разлочки, если она ещё летит. */
export function afterMediaUnlock(run: () => void): void {
  if (unlocked || !pending) {
    run();
    return;
  }
  void pending.then(run);
}
