import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import Home from '@/pages/Home/Home.vue';
import { useOnlineStore } from '@/stores/online';

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  return {
    ...actual,
    useRoute: () => ({ name: 'home' }),
    useRouter: () => ({ push: vi.fn() }),
  };
});

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(Home, { global: { plugins: [pinia] } });
}

describe('pages/Home — офлайн-баннер', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('показывает «Офлайн-режим» только когда isOnline === false', async () => {
    const wrapper = mountPage();
    const online = useOnlineStore();

    online.isOnline = null;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.offline-banner').exists()).toBe(false);

    online.isOnline = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.offline-banner').exists()).toBe(false);

    online.isOnline = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.offline-banner').exists()).toBe(true);
    expect(wrapper.find('.offline-banner').text()).toContain('Офлайн-режим');
  });
});
