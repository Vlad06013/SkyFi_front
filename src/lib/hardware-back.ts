import { ref } from 'vue';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import router from '@/router';
import { useToastStore } from '@/stores/toast';

/** Подтверждение выхода. Открыто — «назад» его закрывает, а не выходит. */
export const exitPromptOpen = ref(false);

type OverlayHandler = () => boolean;

const overlays: OverlayHandler[] = [];

/** Верхний слой (шит, меню, плеер) забирает «назад» раньше маршрута. true — жест съеден. */
export function pushBackOverlay(handler: OverlayHandler): () => void {
  overlays.push(handler);
  return () => {
    const index = overlays.lastIndexOf(handler);
    if (index >= 0) overlays.splice(index, 1);
  };
}

const EXIT_WINDOW_MS = 2_000;
let exitArmedUntil = 0;

/**
 * Куда вести маршрут, когда слои уже закрыты.
 * Корень (главная и логин) — выход. Иначе шаг истории, а если его нет — главная.
 */
export function routeBackTarget(routeName: string, historyBack: string | null): 'back' | 'home' | 'exit-root' {
  if (routeName === 'home' || routeName === 'login') return 'exit-root';
  if (historyBack && historyBack !== '/login') return 'back';
  return 'home';
}

function historyBack(): string | null {
  const back = router.options.history.state.back;
  return typeof back === 'string' ? back : null;
}

export function handleHardwareBack() {
  if (exitPromptOpen.value) {
    exitPromptOpen.value = false;
    return;
  }
  for (let index = overlays.length - 1; index >= 0; index -= 1) {
    if (overlays[index]()) return;
  }
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => undefined);
    return;
  }

  const name = String(router.currentRoute.value.name ?? '');
  const target = routeBackTarget(name, historyBack());
  if (target === 'back') {
    exitArmedUntil = 0;
    router.back();
    return;
  }
  if (target === 'home') {
    exitArmedUntil = 0;
    void router.replace('/home');
    return;
  }

  const now = Date.now();
  if (now < exitArmedUntil) {
    exitPromptOpen.value = true;
    exitArmedUntil = 0;
    return;
  }
  exitArmedUntil = now + EXIT_WINDOW_MS;
  useToastStore().show('Выход', 'нажмите «назад» ещё раз');
}

export async function confirmExit() {
  exitPromptOpen.value = false;
  if (!Capacitor.isNativePlatform()) return;
  await App.exitApp();
}

export function bindHardwareBack() {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('backButton', () => {
    handleHardwareBack();
  });
}
