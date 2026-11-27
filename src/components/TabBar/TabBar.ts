import { computed, defineComponent } from 'vue';
import { useRoute } from 'vue-router';
import { useFriendsStore } from '@/stores/friends';
import { useLayoutStore } from '@/stores/layout';

export default defineComponent({
  name: 'TabBar',
  setup() {
    const friends = useFriendsStore();
    const isTv = computed(() => useLayoutStore().profile === 'tv');
    const tabs = computed(() => {
      const items = [
        { id: 'home', to: '/home', label: 'Главная', badge: false },
        { id: 'search', to: '/search', label: 'Поиск', badge: false },
        { id: 'library', to: '/library', label: 'Моё', badge: false },
        { id: 'friends', to: '/friends', label: 'Друзья', badge: friends.incoming.length > 0 },
        { id: 'settings', to: '/settings', label: 'Настройки', badge: false },
      ];
      return isTv.value ? items.filter((item) => item.id !== 'friends') : items;
    });

    const route = useRoute();

    function isOn(to: string) {
      if (to === '/library') {
        return (
          route.path === '/library' ||
          route.path.startsWith('/playlist/') ||
          route.path.startsWith('/album/') ||
          route.path.startsWith('/artist/')
        );
      }
      return route.path === to || route.path.startsWith(`${to}/`);
    }

    return { tabs, isOn, isTv };
  },
});
