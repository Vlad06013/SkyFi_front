import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import MiniPlayer from '@/components/MiniPlayer/MiniPlayer.vue';
import { usePlayerStore } from '@/stores/player';
import type { TrackSnapshot } from '@/types';

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
