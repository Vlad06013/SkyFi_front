import { computed, defineComponent, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import MiniPlayer from '@/components/MiniPlayer/MiniPlayer.vue';
import TabBar from '@/components/TabBar/TabBar.vue';
import NotificationPanel from '@/components/NotificationPanel/NotificationPanel.vue';
import NowPlaying from '@/components/NowPlaying/NowPlaying.vue';

export default defineComponent({
  name: 'TabsLayout',
  components: { MiniPlayer, TabBar, NotificationPanel, NowPlaying },
  setup() {
    const route = useRoute();
    const isHome = computed(() => route.path === '/home');
    const bodyEl = ref<HTMLElement | null>(null);
    // Скролл один на все вкладки. Позицию запоминаем до смены страницы,
    // возвращаем после: иначе «Моё», уехавшее вниз, сдвигает и главную.
    const scrollTops = new Map<string, number>();

    watch(
      () => route.path,
      (_path, previous) => {
        const el = bodyEl.value;
        if (!el || !previous) return;
        scrollTops.set(previous, el.scrollTop);
      },
    );

    watch(
      () => route.path,
      (path) => {
        const el = bodyEl.value;
        if (!el) return;
        el.scrollTop = path === '/home' ? 0 : (scrollTops.get(path) ?? 0);
      },
      { flush: 'post' },
    );

    return { isHome, bodyEl };
  },
});
