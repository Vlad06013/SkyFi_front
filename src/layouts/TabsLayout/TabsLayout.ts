import { computed, defineComponent } from 'vue';
import { useRoute } from 'vue-router';
import AppToast from '@/components/AppToast/AppToast.vue';
import MiniPlayer from '@/components/MiniPlayer/MiniPlayer.vue';
import TabBar from '@/components/TabBar/TabBar.vue';
import NotificationPanel from '@/components/NotificationPanel/NotificationPanel.vue';
import NowPlaying from '@/components/NowPlaying/NowPlaying.vue';

export default defineComponent({
  name: 'TabsLayout',
  components: { AppToast, MiniPlayer, TabBar, NotificationPanel, NowPlaying },
  setup() {
    const route = useRoute();
    const isHome = computed(() => route.path === '/home');

    return { isHome };
  },
});
