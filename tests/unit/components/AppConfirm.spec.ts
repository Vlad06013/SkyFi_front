import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AppConfirm from '@/components/AppConfirm/AppConfirm.vue';

function mountConfirm(props: Record<string, unknown> = {}) {
  return mount(AppConfirm, {
    props: { open: true, title: 'Удалить из друзей?', ...props },
    global: { stubs: { teleport: true } },
  });
}

describe('components/AppConfirm', () => {
  it('рисует заголовок, сообщение и подписи кнопок', () => {
    const wrapper = mountConfirm({
      message: 'Вы перестанете быть друзьями.',
      confirmLabel: 'Удалить',
    });

    expect(wrapper.find('.confirm-title').text()).toBe('Удалить из друзей?');
    expect(wrapper.find('.confirm-msg').text()).toBe('Вы перестанете быть друзьями.');
    const buttons = wrapper.findAll('.confirm-btn');
    expect(buttons[0].text()).toBe('Удалить');
    expect(buttons[1].text()).toBe('Отменить');
  });

  it('по умолчанию подтверждение опасное (btn-danger), danger=false — primary', () => {
    expect(mountConfirm().find('.confirm-btn').classes()).toContain('btn-danger');
    expect(mountConfirm({ danger: false }).find('.confirm-btn').classes()).toContain('btn-primary');
  });

  it('подтверждение эмитит confirm и закрывается', async () => {
    const wrapper = mountConfirm();
    await wrapper.findAll('.confirm-btn')[0].trigger('click');

    expect(wrapper.emitted('confirm')).toHaveLength(1);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('отмена: клик по кнопке и по маске, Esc', async () => {
    const wrapper = mountConfirm();

    await wrapper.findAll('.confirm-btn')[1].trigger('click');
    expect(wrapper.emitted('confirm')).toBeUndefined();
    expect(wrapper.emitted('close')).toHaveLength(1);

    const fresh = mountConfirm();
    await fresh.find('.confirm-mask').trigger('click');
    expect(fresh.emitted('close')).toHaveLength(1);

    const esc = mountConfirm();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(esc.emitted('close')).toHaveLength(1);
  });

  it('обязательный диалог не закрывается и прячет отмену', async () => {
    const wrapper = mountConfirm({ locked: true, confirmDisabled: true });
    expect(wrapper.findAll('.confirm-btn')).toHaveLength(1);

    await wrapper.find('.confirm-mask').trigger('click');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.find('.confirm-btn').trigger('click');
    expect(wrapper.emitted('close')).toBeUndefined();
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('закрыт — не рендерится', () => {
    const wrapper = mountConfirm({ open: false });
    expect(wrapper.find('.confirm-sheet').exists()).toBe(false);
  });
});
