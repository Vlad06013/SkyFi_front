import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AppSplash from '@/components/AppSplash/AppSplash.vue';

describe('components/AppSplash', () => {
  it('рендерит знак и словесный логотип', () => {
    const wrapper = mount(AppSplash);
    expect(wrapper.text()).toContain('SkyFi');
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.find('.app-splash-mark').exists()).toBe(true);
  });
});
