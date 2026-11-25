import { computed, defineComponent } from 'vue';
import { useRoute } from 'vue-router';
import { useFriendsStore } from '@/stores/friends';

export default defineComponent({
  name: 'TabBar',
  setup() {
    const friends = useFriendsStore();
    const tabs = computed(() => [
      { id: 'home', to: '/home', label: 'Главная', badge: false },
      { id: 'search', to: '/search', label: 'Поиск', badge: false },
      { id: 'library', to: '/library', label: 'Моё', badge: false },
      { id: 'friends', to: '/friends', label: 'Друзья', badge: friends.incoming.length > 0 },
      { id: 'settings', to: '/settings', label: 'Настройки', badge: false },
    ]);

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

    return { tabs, isOn };
  },
});
