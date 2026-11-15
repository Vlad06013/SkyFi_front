import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { toastController } from '@ionic/vue';

type HardwareBackHandler = () => boolean;

const handlers: HardwareBackHandler[] = [];
let listenerAttached = false;

// Двойное нажатие «назад» в корне стека — выход из приложения.
const EXIT_CONFIRM_WINDOW_MS = 3000;
let lastBackPressAt = 0;
let exitToast: HTMLIonToastElement | null = null;

async function showExitToast(): Promise<void> {
    await exitToast?.dismiss().catch(() => {
        // Тост уже закрыт.
    });

    exitToast = await toastController.create({
        message: 'Нажми «назад» ещё раз, чтобы выйти',
        duration: EXIT_CONFIRM_WINDOW_MS,
        position: 'bottom',
        cssClass: 'player-toast',
    });

    await exitToast.present();
}

async function handleExitPress(): Promise<void> {
    const now = Date.now();

    if (now - lastBackPressAt < EXIT_CONFIRM_WINDOW_MS) {
        lastBackPressAt = 0;

        await exitToast?.dismiss().catch(() => {
            // Тост уже закрыт.
        });

        void App.exitApp();
        return;
    }

    lastBackPressAt = now;
    await showExitToast();
}

/*
 * Железная кнопка «назад» Android (пульт ТВ): сначала закрываем
 * открытые оверлеи (обработчик возвращает true), затем идём
 * по истории назад, а в корне стека выходим из приложения —
 * но только по двойному нажатию, чтобы случайное нажатие
 * пульта не закрывало приложение.
 */
export function initHardwareBackButton(): void {
    if (listenerAttached || !Capacitor.isNativePlatform()) {
        return;
    }

    listenerAttached = true;

    void App.addListener('backButton', ({ canGoBack }) => {
        for (let i = handlers.length - 1; i >= 0; i -= 1) {
            if (handlers[i]()) {
                return;
            }
        }

        if (canGoBack) {
            window.history.back();
        } else {
            void handleExitPress();
        }
    });
}

export function registerHardwareBackHandler(
    handler: HardwareBackHandler,
): () => void {
    initHardwareBackButton();
    handlers.push(handler);

    return () => {
        const index = handlers.indexOf(handler);

        if (index !== -1) {
            handlers.splice(index, 1);
        }
    };
}
