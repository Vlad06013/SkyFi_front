import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SeekBar from '@/components/SeekBar/SeekBar.vue';
import { remoteScrubVelocity } from '@/components/SeekBar/SeekBar';

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

  it('короткий клик пульта сдвигает позицию на секунду', async () => {
    const wrapper = mount(SeekBar, {
      props: { modelValue: 40, duration: 200, label: 'позиция' },
    });
    await wrapper.get('.seek-bar').trigger('keydown', { key: 'ArrowRight' });
    const next = wrapper.emitted('update:modelValue')?.[0]?.[0] as number;
    expect(next).toBeCloseTo(40.5, 5);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
  });

  it('удержание разгоняется: в начале медленнее, чем через полторы секунды', () => {
    const slow = remoteScrubVelocity(0, 180);
    const fast = remoteScrubVelocity(1400, 180);
    expect(slow).toBeLessThan(5);
    expect(fast).toBeGreaterThan(slow * 4);
  });

  it('без пропа buffered сегментов нет', () => {
    const wrapper = mount(SeekBar, {
      props: { modelValue: 0, label: 'позиция' },
    });
    expect(wrapper.findAll('.buffer .seg')).toHaveLength(0);
  });
});
