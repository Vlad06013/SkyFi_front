import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

type HardwareBackHandler = () => boolean;

const handlers: HardwareBackHandler[] = [];
let listenerAttached = false;

/*
 * Железная кнопка «назад» Android (пульт ТВ): сначала закрываем
 * открытые оверлеи (обработчик возвращает true), затем идём
 * по истории назад, а на корневом экране выходим из приложения.
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
            void App.exitApp();
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
