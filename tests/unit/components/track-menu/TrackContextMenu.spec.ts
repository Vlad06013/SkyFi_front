import {beforeEach, describe, expect, it, vi} from 'vitest';
import {mount} from '@vue/test-utils';
import {createPinia, setActivePinia} from 'pinia';

import TrackContextMenu from '@/components/track-menu/TrackContextMenu.vue';
import {useNetworkStore} from '@/stores/network';
import type {Track} from '@/types/TrackType';

/**
 * Меню «три точки» у трека в списке.
 * Ключевые сценарии: онлайн — все действия доступны;
 * офлайн — серверные действия заблокированы, у скачанного трека
 * есть «Удалить с устройства»; не скачанный трек офлайн меню
 * вовсе не открывает.
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

function makeTrack(title = 'Трек'): Track {
    return {
        id: 1,
        title,
        source_type: 'app',
        source_id: null,
        duration: 180_000,
        meta: {album: null, artists: [{id: 1, name: 'Tester'}]},
        file: null,
    };
}

function mountMenu(props: Record<string, unknown> = {}) {
    return mount(TrackContextMenu, {
        props: {track: makeTrack(), ...props},
        global: {
            stubs: {
                Teleport: true,
                IonIcon: true,
                IonSpinner: true,
                AddToPlaylistItem: true,
                DownloadStatusIcon: true,
                ShareTrackModal: true,
            },
        },
    });
}

async function openMenu(wrapper: ReturnType<typeof mountMenu>) {
    await wrapper.find('.track-menu-trigger').trigger('click');
}

function menuButtons(wrapper: ReturnType<typeof mountMenu>) {
    return wrapper.findAll('.track-context-menu button');
}

function buttonByText(
    wrapper: ReturnType<typeof mountMenu>,
    text: string,
) {
    return menuButtons(wrapper).find((button) =>
        button.text().includes(text),
    );
}

describe('TrackContextMenu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setActivePinia(createPinia());

        mocks.downloads.isDownloaded.mockReturnValue(false);
    });

    describe('онлайн', () => {
        it('все серверные действия доступны', async () => {
            const wrapper = mountMenu({isFavorite: false});

            await openMenu(wrapper);

            for (const label of [
                'Играть следующим',
                'Добавить в очередь',
                'Добавить в избранное',
                'Поделиться',
            ]) {
                const button = buttonByText(wrapper, label);

                expect(button, label).toBeDefined();
                expect(button!.attributes('disabled')).toBeUndefined();
            }
        });

        it('подпись избранного переключается от isFavorite', async () => {
            const wrapper = mountMenu({isFavorite: true});

            await openMenu(wrapper);

            expect(
                buttonByText(wrapper, 'Удалить из избранного'),
            ).toBeDefined();
        });

        it('клик по избранному шлёт событие с текущим состоянием', async () => {
            const wrapper = mountMenu({isFavorite: true});
            const track = makeTrack();

            await openMenu(wrapper);
            await buttonByText(wrapper, 'Удалить из избранного')!
                .trigger('click');

            const events = wrapper.emitted('action');

            expect(events).toHaveLength(1);
            expect(events![0]).toEqual([track, 'favorite', true]);
        });

        it('moveToTop доступен по флагу и шлёт событие', async () => {
            const wrapper = mountMenu({movableToTop: true});
            const track = makeTrack();

            await openMenu(wrapper);
            await buttonByText(wrapper, 'В начало списка')!
                .trigger('click');

            expect(wrapper.emitted('moveToTop')).toEqual([[track]]);
        });
    });

    describe('офлайн', () => {
        async function goOffline(run: () => Promise<void>) {
            const network = useNetworkStore();

            network.markServerDown();

            try {
                await run();
            } finally {
                network.markServerUp();
            }
        }

        it('скачанный трек: серверные действия выключены, есть удаление', async () => {
            await goOffline(async () => {
                mocks.downloads.isDownloaded.mockReturnValue(true);

                const wrapper = mountMenu({isFavorite: false});

                await openMenu(wrapper);

                for (const label of [
                    'Играть следующим',
                    'Добавить в очередь',
                    'Добавить в избранное',
                ]) {
                    const button = buttonByText(wrapper, label);

                    expect(button, label).toBeDefined();
                    expect(
                        button!.attributes('disabled'),
                        label,
                    ).toBeDefined();
                }

                // Скачивание/поделиться онлайн-пункты скрыты целиком.
                expect(
                    buttonByText(wrapper, 'Поделиться'),
                ).toBeUndefined();
                expect(
                    buttonByText(wrapper, 'Скачать для офлайна'),
                ).toBeUndefined();

                const removeButton = buttonByText(
                    wrapper,
                    'Удалить с устройства',
                );

                expect(removeButton).toBeDefined();
                expect(removeButton!.attributes('disabled')).toBeUndefined();
            });
        });

        it('клик по «Удалить с устройства» удаляет скачанное', async () => {
            await goOffline(async () => {
                mocks.downloads.isDownloaded.mockReturnValue(true);

                const wrapper = mountMenu();

                await openMenu(wrapper);
                await buttonByText(wrapper, 'Удалить с устройства')!
                    .trigger('click');

                expect(mocks.downloads.remove).toHaveBeenCalledTimes(1);
                expect(
                    wrapper.find('.track-context-menu').exists(),
                ).toBe(false);
            });
        });

        it('не скачанный трек: кнопка меню заблокирована', async () => {
            await goOffline(async () => {
                mocks.downloads.isDownloaded.mockReturnValue(false);

                const wrapper = mountMenu();

                const trigger = wrapper.find('.track-menu-trigger');

                expect(trigger.attributes('disabled')).toBeDefined();

                await trigger.trigger('click');

                expect(
                    wrapper.find('.track-context-menu').exists(),
                ).toBe(false);
            });
        });
    });
});
