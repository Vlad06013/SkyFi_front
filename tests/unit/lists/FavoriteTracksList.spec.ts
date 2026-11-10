import {beforeEach, describe, expect, it, vi} from 'vitest';
import {defineComponent} from 'vue';
import {mount} from '@vue/test-utils';
import {createPinia, setActivePinia} from 'pinia';

import FavoriteTracksList from '@/components/lists/FavoriteTracksList.vue';
import {useNetworkStore} from '@/stores/network';
import {PlaySourceListsEnum} from '@/types/PlaySourceListsEnum';
import type {Track} from '@/types/TrackType';

/**
 * Список избранного как связка с плеером: клик/клавиша запускают
 * трек через очередь, повторный клик по текущему — пауза,
 * офлайн без скачанного файла блокируется, действия меню
 * уходят в плеер, синхронизация очереди по полному списку.
 */

const mocks = vi.hoisted(() => ({
    toastCreate: vi.fn(),
    toastLastOptions: undefined as {message?: string} | undefined,
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
    player: {
        isPlaying: false,
        isLoading: false,
        isServerSyncEnabled: true,
        currentTrack: null as Track | null,
        liked: false,
        setQueue: vi.fn(),
        playTrack: vi.fn(async () => undefined),
        togglePlay: vi.fn(async () => undefined),
        addToQueue: vi.fn(async () => undefined),
        playTrackNext: vi.fn(async () => undefined),
        toggleFavorite: vi.fn(async () => undefined),
    },
}));

vi.mock('@/stores/downloads', () => ({
    useDownloadsStore: () => mocks.downloads,
}));

vi.mock('@/stores/player', () => ({
    default: () => mocks.player,
}));

vi.mock('@ionic/vue', () => ({
    IonIcon: {template: '<i class="ion-icon-stub"/>'},
    IonSpinner: {template: '<i class="ion-spinner-stub"/>'},
    toastController: {
        create: mocks.toastCreate.mockImplementation(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (options: any) => {
                mocks.toastLastOptions = options;

                return {present: vi.fn()};
            },
        ),
    },
}));

const TrackContextMenuStub = defineComponent({
    name: 'TrackContextMenu',
    props: {
        track: {type: Object, required: true},
        isFavorite: Boolean,
        loading: Boolean,
        movableToTop: Boolean,
    },
    emits: ['open', 'close', 'action', 'moveToTop'],
    template: `
        <div class="menu-stub">
            <button class="menu-act-queue" @click="$emit('action', track, 'queue', true)">queue</button>
            <button class="menu-act-next" @click="$emit('action', track, 'next', true)">next</button>
            <button class="menu-act-fav" @click="$emit('action', track, 'favorite', true)">fav</button>
            <button class="menu-mtt" @click="$emit('moveToTop', track)">mtt</button>
        </div>
    `,
});

let trackSeq = 0;

function makeTrack(title: string): Track {
    trackSeq += 1;

    return {
        id: trackSeq,
        title,
        source_type: 'app',
        source_id: null,
        duration: 180_000,
        meta: {album: null, artists: [{id: 1, name: 'Tester'}]},
        file: null,
    };
}

function mountList(items: Track[], queueTracks?: Track[]) {
    return mount(FavoriteTracksList, {
        attachTo: document.body,
        props: {
            items,
            queueTracks: queueTracks ?? items,
            hasMore: false,
            loadMore: async () => undefined,
            loading: false,
            error: null,
            retry: vi.fn(),
        },
        global: {
            stubs: {
                IonIcon: true,
                IonSpinner: true,
                IonButton: true,
                TrackContextMenu: TrackContextMenuStub,
            },
        },
    });
}

function rows(wrapper: ReturnType<typeof mountList>) {
    return wrapper.findAll('.track-row');
}

describe('FavoriteTracksList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setActivePinia(createPinia());

        mocks.player.currentTrack = null;
        mocks.downloads.isDownloaded.mockReturnValue(true);
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('рендерит строки треков', () => {
        const wrapper = mountList([
            makeTrack('Альфа'),
            makeTrack('Бета'),
        ]);

        expect(rows(wrapper)).toHaveLength(2);
        expect(wrapper.text()).toContain('Альфа');
        expect(wrapper.text()).toContain('Бета');
    });

    it('при монтировании синхронизирует очередь плеера по полному списку', () => {
        const tracks = [makeTrack('А'), makeTrack('Б')];

        mountList(tracks.slice(0, 1), tracks);

        expect(mocks.player.setQueue).toHaveBeenCalledWith(
            tracks,
            PlaySourceListsEnum.FAVORITES,
        );
    });

    it('клик по строке ставит очередь и запускает трек', async () => {
        const tracks = [makeTrack('А'), makeTrack('Б')];
        const wrapper = mountList(tracks);

        await rows(wrapper)[1].trigger('click');

        expect(mocks.player.setQueue).toHaveBeenCalledWith(
            tracks,
            PlaySourceListsEnum.FAVORITES,
        );
        expect(mocks.player.playTrack).toHaveBeenCalledWith(
            tracks[1],
            PlaySourceListsEnum.FAVORITES,
        );
    });

    it('клик по текущему треку — пауза/продолжение, а не перезапуск', async () => {
        const tracks = [makeTrack('А'), makeTrack('Б')];

        mocks.player.currentTrack = tracks[0] as never;

        const wrapper = mountList(tracks);

        await rows(wrapper)[0].trigger('click');

        expect(mocks.player.togglePlay).toHaveBeenCalledWith(
            PlaySourceListsEnum.FAVORITES,
        );
        expect(mocks.player.playTrack).not.toHaveBeenCalled();
    });

    it('офлайн и трек не скачан: тост, воспроизведение не стартует', async () => {
        const network = useNetworkStore();

        network.markServerDown();

        try {
            mocks.downloads.isDownloaded.mockReturnValue(false);

            const tracks = [makeTrack('А')];
            const wrapper = mountList(tracks);

            await rows(wrapper)[0].trigger('click');

            expect(mocks.toastLastOptions?.message).toBe(
                'Трек не скачан — офлайн недоступен',
            );
            expect(mocks.player.playTrack).not.toHaveBeenCalled();
        } finally {
            network.markServerUp();
        }
    });

    it('офлайн и трек скачан — играет', async () => {
        const network = useNetworkStore();

        network.markServerDown();

        try {
            mocks.downloads.isDownloaded.mockReturnValue(true);

            const tracks = [makeTrack('А')];
            const wrapper = mountList(tracks);

            await rows(wrapper)[0].trigger('click');

            expect(mocks.player.playTrack).toHaveBeenCalledTimes(1);
        } finally {
            network.markServerUp();
        }
    });

    it('Enter запускает трек; синтезированный click с пульта не дублирует запуск', async () => {
        const tracks = [makeTrack('А')];
        const wrapper = mountList(tracks);

        await rows(wrapper)[0].trigger('keydown', {key: 'Enter'});
        await rows(wrapper)[0].trigger('click');

        expect(mocks.player.playTrack).toHaveBeenCalledTimes(1);
    });

    it('ArrowDown переносит фокус на следующую строку', async () => {
        const tracks = [makeTrack('А'), makeTrack('Б')];
        const wrapper = mountList(tracks);

        await rows(wrapper)[0].element.focus();
        await rows(wrapper)[0].trigger('keydown', {key: 'ArrowDown'});

        expect(document.activeElement).toBe(rows(wrapper)[1].element);
    });

    it('действия меню уходят в плеер', async () => {
        const tracks = [makeTrack('А')];
        const wrapper = mountList(tracks);

        await wrapper.find('.menu-act-queue').trigger('click');
        expect(mocks.player.addToQueue).toHaveBeenCalledWith(tracks[0]);

        await wrapper.find('.menu-act-next').trigger('click');
        expect(mocks.player.playTrackNext).toHaveBeenCalledWith(tracks[0]);

        const retry = wrapper.props('retry') as ReturnType<typeof vi.fn>;

        await wrapper.find('.menu-act-fav').trigger('click');
        expect(mocks.player.toggleFavorite).toHaveBeenCalledWith(
            tracks[0],
            true,
        );
        expect(retry).toHaveBeenCalled();
    });

    it('«В начало списка» пробрасывает событие наружу', async () => {
        const tracks = [makeTrack('А')];
        const wrapper = mountList(tracks);

        await wrapper.find('.menu-mtt').trigger('click');

        expect(wrapper.emitted('moveToTop')).toEqual([[tracks[0]]]);
    });

    it('офлайн-недоступные треки помечаются классом', () => {
        const network = useNetworkStore();

        network.markServerDown();

        try {
            mocks.downloads.isDownloaded.mockImplementation(
                (track: Track) => track.title === 'Скачан',
            );

            const wrapper = mountList([
                makeTrack('Скачан'),
                makeTrack('Не скачан'),
            ]);

            const classes = rows(wrapper).map((row) =>
                row.classes(),
            );

            expect(classes[0]).not.toContain(
                'track-row-offline-unavailable',
            );
            expect(classes[1]).toContain(
                'track-row-offline-unavailable',
            );
        } finally {
            network.markServerUp();
        }
    });
});
