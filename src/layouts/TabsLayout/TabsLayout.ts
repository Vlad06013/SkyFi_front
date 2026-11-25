import { computed, defineComponent, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import MiniPlayer from '@/components/MiniPlayer/MiniPlayer.vue';
import TabBar from '@/components/TabBar/TabBar.vue';
import NotificationPanel from '@/components/NotificationPanel/NotificationPanel.vue';
import NowPlaying from '@/components/NowPlaying/NowPlaying.vue';
import { refreshActivePage } from '@/composables/usePageRefresh';

export default defineComponent({
  name: 'TabsLayout',
  components: { MiniPlayer, TabBar, NotificationPanel, NowPlaying },
  setup() {
    const route = useRoute();
    const isHome = computed(() => route.path === '/home');
    const bodyEl = ref<HTMLElement | null>(null);
    const pull = ref(0);
    const refreshing = ref(false);
    const PULL_THRESHOLD = 72;
    const PULL_MAX = 112;
    let pullStartY = 0;
    let pullStartX = 0;
    let pullTracking = false;
    let pullArmed = false;

    const pullReady = computed(() => !refreshing.value && pull.value >= PULL_THRESHOLD);
    const pullLabel = computed(() => {
      if (refreshing.value) return 'Обновление';
      return pullReady.value ? 'Отпустите, чтобы обновить' : 'Потяните, чтобы обновить';
    });

    function onPullStart(event: TouchEvent) {
      if (refreshing.value) return;
      const el = bodyEl.value;
      const touch = event.touches[0];
      if (!el || !touch || el.scrollTop > 0) return;
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, .grip')) return;
      pullStartY = touch.clientY;
      pullStartX = touch.clientX;
      pullTracking = true;
      pullArmed = false;
    }

    function onPullMove(event: TouchEvent) {
      if (!pullTracking || refreshing.value) return;
      const el = bodyEl.value;
      const touch = event.touches[0];
      if (!el || !touch) return;
      if (el.scrollTop > 0) {
        pullTracking = false;
        pull.value = 0;
        return;
      }
      const dy = touch.clientY - pullStartY;
      const dx = touch.clientX - pullStartX;
      if (!pullArmed) {
        if (dy < 10) return;
        if (Math.abs(dx) > dy) {
          pullTracking = false;
          return;
        }
        pullArmed = true;
      }
      event.preventDefault();
      pull.value = Math.min(PULL_MAX, dy * 0.5);
    }

    function onPullEnd() {
      if (!pullTracking) return;
      pullTracking = false;
      if (pull.value < PULL_THRESHOLD) {
        pull.value = 0;
        return;
      }
      pull.value = 56;
      refreshing.value = true;
      const started = Date.now();
      void refreshActivePage(route.name).finally(async () => {
        const wait = 450 - (Date.now() - started);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        refreshing.value = false;
        pull.value = 0;
      });
    }

    onMounted(() => {
      bodyEl.value?.addEventListener('touchmove', onPullMove, { passive: false });
    });
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

    return { isHome, bodyEl, pull, pullReady, refreshing, pullLabel, onPullStart, onPullEnd };
  },
});
