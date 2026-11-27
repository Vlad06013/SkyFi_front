import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import OfflineBanner from '@/components/OfflineBanner/OfflineBanner.vue';
import { useOnlineStore } from '@/stores/online';

describe('components/OfflineBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('показывает «Офлайн-режим» только когда isOnline === false', async () => {
    const wrapper = mount(OfflineBanner);
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
