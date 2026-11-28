import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import MiniPlayer from '@/components/MiniPlayer/MiniPlayer.vue';
import { usePlayerStore } from '@/stores/player';
import type { QueueItem, TrackSnapshot } from '@/types';

function track(sourceId: string): TrackSnapshot {
  return {
    type: 'track',
    source_type: 'yandex_music',
    source_id: sourceId,
    title: sourceId,
    artists: [{ name: 'a' }],
    duration_ms: 180000,
    cover_url: null,
    album: null,
    stream_url: null,
  };
}

function installScroll(el: HTMLElement, width: number) {
  let left = 0;
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(el, 'scrollLeft', {
    configurable: true,
    get: () => left,
    set: (value: number) => {
      left = value;
    },
  });
  return () => left;
}

async function frames(count: number) {
  for (let i = 0; i < count; i += 1) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  }
}

describe('components/MiniPlayer — кнопка play', () => {
  it('видимый дубль текущего трека показывает паузу и тоглит', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const player = usePlayerStore();
    player.state = { ...player.state, current_snapshot: track('t1'), is_playing: true };

    const wrapper = mount(MiniPlayer, { global: { plugins: [pinia] } });
    await nextTick();

    const buttons = wrapper.findAll('.fab');
    expect(buttons[0]?.attributes('aria-label')).toBe('пауза');

    await buttons[0]?.trigger('click');
    await nextTick();

    expect(player.state.is_playing).toBe(false);
    expect(buttons[0]?.attributes('aria-label')).toBe('играть');
  });

  it('после раскладки вьюпорт стоит на текущем слайде', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const player = usePlayerStore();
    player.state = { ...player.state, current_snapshot: track('t1'), is_playing: false };

    const wrapper = mount(MiniPlayer, {
      global: { plugins: [pinia] },
      attachTo: document.body,
    });
    const el = wrapper.get('.mp-track').element as HTMLElement;
    const scrollLeft = installScroll(el, 320);

    await nextTick();
    await frames(2);

    expect(scrollLeft()).toBe(340);
    wrapper.unmount();
  });
});

describe('components/MiniPlayer — свайпы (баг 15)', () => {
  function pointer(type: string, x: number): Event {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, {
      clientX: { value: x },
      pointerId: { value: 1 },
      pointerType: { value: 'touch' },
      button: { value: 0 },
    });
    return event;
  }

  function queueItem(id: number, snapshot: TrackSnapshot): QueueItem {
    return { id, player_state_id: 1, added_by_user_id: null, position: id, status: 'pending', snapshot };
  }

  function setup() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const player = usePlayerStore();
    player.state = { ...player.state, current_snapshot: track('t1'), is_playing: true };
    // Очередь даёт previewNext/previewPrevious без сети.
    player.queue = [queueItem(1, track('t2')), queueItem(2, track('t3'))];
    const skipNext = vi.spyOn(player, 'skipNext').mockImplementation(() => undefined);
    const wrapper = mount(MiniPlayer, { global: { plugins: [pinia] }, attachTo: document.body });
    const el = wrapper.get('.mp-track').element as HTMLElement;
    const scrollLeft = installScroll(el, 320);
    // jsdom не знает pointer capture и element.scrollTo — заглушки.
    Object.assign(el, {
      setPointerCapture: () => undefined,
      releasePointerCapture: () => undefined,
      hasPointerCapture: () => false,
      scrollTo: (opts: { left?: number }) => {
        if (opts.left != null) el.scrollLeft = opts.left;
      },
    });
    return { player, wrapper, el, scrollLeft, skipNext };
  }

  function swipe(el: HTMLElement, from: number, to: number) {
    el.dispatchEvent(pointer('pointerdown', from));
    window.dispatchEvent(pointer('pointermove', to));
    window.dispatchEvent(pointer('pointerup', to));
  }

  it('свайп влево коммитит next сразу по отпусканию, без scroll-событий и дебаунса', async () => {
    const { wrapper, el, scrollLeft, skipNext } = setup();
    await nextTick();

    swipe(el, 300, 180);

    expect(skipNext).toHaveBeenCalledTimes(1);
    // Лента сразу возвращена в центр (коммит не ждёт остановки smooth-скролла).
    expect(scrollLeft()).toBe(340);
    wrapper.unmount();
  });

  it('быстрые свайпы подряд коммитят каждый, а не схлопываются в один', async () => {
    const { wrapper, el, skipNext } = setup();
    await nextTick();

    swipe(el, 300, 180);
    swipe(el, 300, 180);
    swipe(el, 300, 180);

    expect(skipNext).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });

  it('короткий сдвиг — не свайп: лента возвращается в центр без переключения', async () => {
    const { wrapper, el, scrollLeft, skipNext } = setup();
    await nextTick();

    swipe(el, 300, 270);

    expect(skipNext).not.toHaveBeenCalled();
    expect(scrollLeft()).toBe(340);
    wrapper.unmount();
  });
});
