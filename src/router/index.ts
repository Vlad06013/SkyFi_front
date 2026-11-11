import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import WavePage from '../views/Wave/WavePage.vue'
import SearchPage from '@/views/Search/SearchPage.vue';
// import LibraryPage from '@/views/Library/LibraryPage.vue';
import PlaylistsPage from '@/views/Playlists/PlaylistsPage.vue';
import LoginPage from '@/views/LoginPage.vue';
import RegisterPage from '@/views/RegisterPage.vue';

import { useAuthStore } from '@/stores/auth';
import Favorite from "@/views/Favorites/Favorite.vue";
import ProfilePage from '@/views/Profile/ProfilePage.vue';
import FriendsPage from '@/views/Friends/FriendsPage.vue';
import FriendPage from '@/views/Friends/FriendPage.vue';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/wave'
  },
  {
    path: '/wave',
    name: 'Wave',
    component: WavePage,
    meta: { requiresAuth: true },
  },
  {
    path: '/search',
    component: SearchPage,
    meta: { requiresAuth: true },
  },
  {
    path: '/profile',
    name: 'profile',
    component: ProfilePage,
    meta: {
      requiresAuth: true,
    },
  },

  {
    path: '/favorite',
    name: 'Favorite',
    component: Favorite,
    meta: { requiresAuth: true },
  },
  {
    path: '/playlists',
    name: 'Playlists',
    component: PlaylistsPage,
    meta: { requiresAuth: true },
  },
  {
    path: '/friends',
    name: 'Friends',
    component: FriendsPage,
    meta: { requiresAuth: true },
  },
  {
    path: '/friends/:id',
    name: 'Friend',
    component: FriendPage,
    meta: { requiresAuth: true },
  },
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
    meta: { guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterPage,
    meta: { guestOnly: true },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  // Вход решаем по кешу мгновенно: офлайн-старт не ждёт
  // таймаут соединения. Есть токен и кеш пользователя —
  // пускаем сразу, сеть ревалидируется в фоне (токен
  // протухнет — следующая навигация уйдёт на /login).
  // Кеша нет — инициализацию ждём, иначе не решить, куда.
  if (!auth.initialized) {
    if (auth.isAuthenticated) {
      void auth.initialize();
    } else {
      await auth.initialize();
    }
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    };
  }

  if (to.meta.guestOnly && auth.isAuthenticated) {
    return '/wave';
  }

  return true;
});
export default router
