import { usePlayerStore } from '@/stores/player';

/** Наши play/pause не должны выглядеть как нажатие медиа-клавиши. */
let owned = 0;

export function runOwned(run: () => void) {
  owned += 1;
  try {
    run();
  } finally {
    window.setTimeout(() => {
      owned = Math.max(0, owned - 1);
    }, 50);
  }
}

export async function runOwnedAsync(run: () => Promise<void>) {
  owned += 1;
  try {
    await run();
  } finally {
    window.setTimeout(() => {
      owned = Math.max(0, owned - 1);
    }, 50);
  }
}

/** Пауза/плей пришли от клавиши или системы, не от нашего кода. */
export function noteExternalTransport(playing: boolean) {
  if (owned > 0) return;
  const player = usePlayerStore();
  if (!player.isActiveDevice) return;
  void player.hardwareTransport(playing ? 'play' : 'pause');
}

let skipAt = 0;

function hardwareSkip(direction: 'next' | 'prev') {
  const now = Date.now();
  if (now - skipAt < 400) return;
  skipAt = now;
  const player = usePlayerStore();
  if (direction === 'next') player.skipNext();
  else void player.skipPrevious();
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('input, textarea, [contenteditable="true"]');
}

/**
 * Медиа-клавиши клавиатуры и пульта. Без этого браузер глушит только
 * аудио-элемент и на бэк ничего не уходит, а следующий/предыдущий молчат.
 */
export function bindMediaKeys() {
  const player = usePlayerStore();
  window.addEventListener('keydown', (event) => {
    if (event.repeat || isTypingTarget(event.target)) return;
    if (event.code === 'MediaTrackNext') {
      event.preventDefault();
      hardwareSkip('next');
    } else if (event.code === 'MediaTrackPrevious') {
      event.preventDefault();
      hardwareSkip('prev');
    } else if (event.code === 'MediaPlayPause') {
      event.preventDefault();
      void player.hardwareTransport(player.state.is_playing ? 'pause' : 'play');
    }
  });

  const session = navigator.mediaSession;
  if (!session) return;
  const set = (action: MediaSessionAction, run: MediaSessionActionHandler) => {
    try {
      session.setActionHandler(action, run);
    } catch {
      /* это действие браузер не отдаёт */
    }
  };
  set('play', () => {
    void player.hardwareTransport('play');
  });
  set('pause', () => {
    void player.hardwareTransport('pause');
  });
  set('nexttrack', () => hardwareSkip('next'));
  set('previoustrack', () => hardwareSkip('prev'));
}
