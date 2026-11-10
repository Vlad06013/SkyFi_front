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
