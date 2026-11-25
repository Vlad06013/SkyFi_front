import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SeekBar from '@/components/SeekBar/SeekBar.vue';

describe('components/SeekBar: буферизованные диапазоны', () => {
  it('рисует сегмент буфера с позицией и шириной в процентах', () => {
    const wrapper = mount(SeekBar, {
      props: {
        modelValue: 10,
        label: 'позиция',
        buffered: [{ start: 0.25, end: 0.75 }],
      },
    });

    const seg = wrapper.find('.buffer .seg');
    expect(seg.exists()).toBe(true);
    expect(seg.attributes('style')).toContain('left: 25%');
    expect(seg.attributes('style')).toContain('width: 50%');
  });

  it('несколько диапазонов — несколько сегментов; пустой буфер — без сегментов', () => {
    const wrapper = mount(SeekBar, {
      props: {
        modelValue: 0,
        label: 'позиция',
        buffered: [
          { start: 0, end: 0.2 },
          { start: 0.5, end: 0.7 },
        ],
      },
    });
    expect(wrapper.findAll('.buffer .seg')).toHaveLength(2);

    wrapper.setProps({ buffered: [] });
    return wrapper.vm.$nextTick().then(() => {
      expect(wrapper.findAll('.buffer .seg')).toHaveLength(0);
    });
  });

  it('влево и вправо с пульта двигают ползунок на 5%', async () => {
    const wrapper = mount(SeekBar, {
      props: { modelValue: 40, label: 'позиция' },
    });
    const bar = wrapper.get('.seek-bar');

    await bar.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([45]);

    await wrapper.setProps({ modelValue: 40 });
    await bar.trigger('keydown', { key: 'ArrowLeft', keyCode: 21 });
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([35]);
  });

  it('без пропа buffered сегментов нет', () => {
    const wrapper = mount(SeekBar, {
      props: { modelValue: 0, label: 'позиция' },
    });
    expect(wrapper.findAll('.buffer .seg')).toHaveLength(0);
  });
});
