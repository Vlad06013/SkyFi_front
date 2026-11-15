import {beforeEach, describe, expect, it, vi} from 'vitest';
import {mount} from '@vue/test-utils';
import {createPinia, setActivePinia} from 'pinia';

import DownloadTrackItem from '@/components/track-menu/DownloadTrackItem.vue';
import type {Track} from '@/types/TrackType';

/**
 * Пункт меню «Скачать для офлайна» / «Удалить скачанное»:
 * подпись и действие зависят от статуса скачивания трека.
 */

const mocks = vi.hoisted(() => ({
    downloads: {
        isDownloaded: vi.fn(),
        hasLocalAudio: vi.fn(),
        getLocalAudioUrl: vi.fn(),
        statusOf: vi.fn(),
        progressOf: vi.fn(),
        download: vi.fn(),
        remove: vi.fn(),
        initialize: vi.fn(),
    },
}));

vi.mock('@/stores/downloads', () => ({
    useDownloadsStore: () => mocks.downloads,
}));

function makeTrack(): Track {
    return {
        id: 1,
        title: 'Трек',
        source_type: 'app',
        source_id: null,
        duration: 180_000,
        meta: {album: null, artists: [{id: 1, name: 'Tester'}]},
        file: null,
    };
}

function mountItem() {
    return mount(DownloadTrackItem, {
        props: {track: makeTrack()},
        global: {
            stubs: {
                IonIcon: true,
                IonSpinner: true,
            },
        },
    });
}

describe('DownloadTrackItem', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setActivePinia(createPinia());

        mocks.downloads.statusOf.mockReturnValue(null);
        mocks.downloads.progressOf.mockReturnValue(null);
    });

    it('не скачан: предлагает скачать и запускает скачивание', async () => {
        const wrapper = mountItem();

        expect(wrapper.text()).toContain('Скачать');

        await wrapper.find('button').trigger('click');

        expect(mocks.downloads.download).toHaveBeenCalledTimes(1);
        expect(mocks.downloads.remove).not.toHaveBeenCalled();
        expect(wrapper.emitted('close')).toBeTruthy();
    });

    it('скачан: предлагает удалить и удаляет', async () => {
        mocks.downloads.statusOf.mockReturnValue('done');

        const wrapper = mountItem();

        expect(wrapper.text()).toContain('Удалить');

        await wrapper.find('button').trigger('click');

        expect(mocks.downloads.remove).toHaveBeenCalledTimes(1);
        expect(mocks.downloads.download).not.toHaveBeenCalled();
    });

    it('ошибка: предлагает повторить и снова качает', async () => {
        mocks.downloads.statusOf.mockReturnValue('error');

        const wrapper = mountItem();

        expect(wrapper.text()).toContain('Повторить скачивание');

        await wrapper.find('button').trigger('click');

        expect(mocks.downloads.download).toHaveBeenCalledTimes(1);
    });

    it('скачивается: показывает прогресс и не реагирует на клик', async () => {
        mocks.downloads.statusOf.mockReturnValue('downloading');
        mocks.downloads.progressOf.mockReturnValue(42);

        const wrapper = mountItem();

        expect(wrapper.text()).toContain('Скачивается… 42%');

        await wrapper.find('button').trigger('click');

        expect(mocks.downloads.download).not.toHaveBeenCalled();
        expect(mocks.downloads.remove).not.toHaveBeenCalled();
    });
});
