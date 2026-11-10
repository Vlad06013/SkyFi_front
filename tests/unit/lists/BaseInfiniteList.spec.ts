import {beforeEach, describe, expect, it, vi} from 'vitest';
import {mount} from '@vue/test-utils';

import BaseInfiniteList from '@/components/lists/BaseInfiniteList.vue';

/**
 * Скелет списков: состояния (данные/пусто/ошибка/конец) и
 * подгрузка страниц по видимости маркера конца списка.
 */

function fakeIO(): {trigger: (isIntersecting?: boolean) => void}[] {
    return (globalThis as Record<string, unknown>).__fakeIO
        ?.instances as never;
}

function mountList(props: Record<string, unknown> = {}) {
    return mount(BaseInfiniteList, {
        props: {
            items: ['a', 'b'],
            hasMore: false,
            loadMore: vi.fn(async () => undefined),
            retry: vi.fn(async () => undefined),
            ...props,
        },
        slots: {
            item: `<template #item="{ item }"><div class="row">{{ item }}</div></template>`,
        },
        global: {
            stubs: {
                IonButton: true,
                IonSpinner: true,
            },
        },
    });
}

describe('BaseInfiniteList', () => {
    beforeEach(() => {
        fakeIO().length = 0;
    });

    it('рендерит элементы через слот', () => {
        const wrapper = mountList();

        expect(wrapper.findAll('.row')).toHaveLength(2);
        expect(wrapper.text()).toContain('a');
        expect(wrapper.text()).toContain('b');
    });

    it('пустой список — заглушка', () => {
        const wrapper = mountList({items: []});

        expect(wrapper.text()).toContain('Список пока пуст.');
    });

    it('ошибка без данных — предлагает повторить, кнопка зовёт retry', async () => {
        const retry = vi.fn(async () => undefined);
        const wrapper = mountList({
            items: [],
            error: 'бум',
            retry,
        });

        expect(wrapper.text()).toContain('Не удалось загрузить список.');

        await wrapper.find('ion-button-stub').trigger('click');

        expect(retry).toHaveBeenCalled();
    });

    it('конец списка: hasMore=false — показывает финальную плашку', () => {
        const wrapper = mountList();

        expect(wrapper.text()).toContain('Больше элементов нет');
    });

    it('маркер в зоне видимости — догружает страницу', async () => {
        const loadMore = vi.fn(async () => undefined);
        const wrapper = mountList({hasMore: true, loadMore});

        await wrapper.vm.$nextTick();

        fakeIO()[0]?.trigger(true);

        expect(loadMore).toHaveBeenCalledTimes(1);
    });

    it('маркер вне зоны видимости — не догружает', async () => {
        const loadMore = vi.fn(async () => undefined);
        const wrapper = mountList({hasMore: true, loadMore});

        await wrapper.vm.$nextTick();

        fakeIO()[0]?.trigger(false);

        expect(loadMore).not.toHaveBeenCalled();
    });
});
