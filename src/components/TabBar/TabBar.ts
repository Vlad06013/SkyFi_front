import { defineComponent } from 'vue';
import { useRoute } from 'vue-router';

export default defineComponent({
  name: 'TabBar',
  setup() {
    const tabs = [
      { id: 'home', to: '/home', label: 'Главная', badge: false },
      { id: 'search', to: '/search', label: 'Поиск', badge: false },
      { id: 'library', to: '/library', label: 'Моё', badge: false },
      { id: 'friends', to: '/friends', label: 'Друзья', badge: true },
      { id: 'settings', to: '/settings', label: 'Настройки', badge: false },
    ] as const;

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
