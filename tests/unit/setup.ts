import {vi} from 'vitest';

/**
 * jsdom не умеет звук: HTMLMediaElement.play() бросает
 * "Not implemented", события не шлются, метаданных нет.
 * Плеер в тестах работает с этим двойником: готовые метаданные
 * (readyState), мгновенный play(), реальные события
 * через EventTarget — обработчики стора отрабатывают как есть.
 */
class FakeAudioElement extends EventTarget {
    src = '';
    currentTime = 0;
    duration = 180;
    volume = 0.7;
    paused = true;
    readyState = 2;
    preload = 'metadata';
    error: unknown = null;

    get currentSrc(): string {
        return this.src;
    }

    play = vi.fn(() => {
        this.paused = false;
        queueMicrotask(() => this.dispatchEvent(new Event('play')));

        return Promise.resolve();
    });

    pause = vi.fn(() => {
        if (this.paused) return;

        this.paused = true;
        this.dispatchEvent(new Event('pause'));
    });

    load = vi.fn(() => {
        queueMicrotask(
            () => this.dispatchEvent(new Event('loadedmetadata')),
        );
    });
}

vi.stubGlobal('Audio', FakeAudioElement);

// jsdom не реализует matchMedia, а меню трека выбирает
// мобильную/десктопную вёрстку через него.
window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
})) as any;

// Фокус-навигация стрелками по спискам зовёт scrollIntoView.
(Element.prototype as {scrollIntoView: unknown}).scrollIntoView = vi.fn();

// IntersectionObserver: заглушка с ручным триггером — тесты сами
// решают, когда маркер конца списка «вошёл в зону видимости».
class FakeIntersectionObserver {
    static instances: FakeIntersectionObserver[] = [];

    private readonly callback: IntersectionObserverCallback;

    private readonly elements: Element[] = [];

    readonly observe = vi.fn((el: Element) => {
        this.elements.push(el);
    });

    readonly unobserve = vi.fn();

    readonly disconnect = vi.fn();

    constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        FakeIntersectionObserver.instances.push(this);
    }

    trigger(isIntersecting = true): void {
        this.callback(
            [
                {
                    isIntersecting,
                    target: this.elements[0],
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
            ],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this as any,
        );
    }
}

vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

(globalThis as Record<string, unknown>).__fakeIO = {
    instances: FakeIntersectionObserver.instances,
};
