import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import TabsLayout from '@/layouts/TabsLayout/TabsLayout.vue';
import Home from '@/pages/Home/Home.vue';
import SearchV2 from '@/pages/SearchV2/SearchV2.vue';
import Library from '@/pages/Library/Library.vue';
import Friends from '@/pages/Friends/Friends.vue';
import Friend from '@/pages/Friend/Friend.vue';
import Settings from '@/pages/Settings/Settings.vue';
import Playlist from '@/pages/Playlist/Playlist.vue';
import Album from '@/pages/Album/Album.vue';
import Artist from '@/pages/Artist/Artist.vue';
import Login from '@/pages/Login/Login.vue';
import QrConfirm from '@/pages/QrConfirm/QrConfirm.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: Login,
    meta: { guestOnly: true },
  },
  {
    path: '/qr-confirm',
    name: 'qr-confirm',
    component: QrConfirm,
    meta: { requiresAuth: true },
  },
  {
    path: '/',
    component: TabsLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/home' },
      { path: 'home', name: 'home', component: Home },
      { path: 'search', name: 'search', component: SearchV2 },
      { path: 'library', name: 'library', component: Library },
      { path: 'friends', name: 'friends', component: Friends },
      { path: 'friends/:id', name: 'friend', component: Friend },
      { path: 'settings', name: 'settings', component: Settings },
      { path: 'playlist/:source/:id', name: 'playlist', component: Playlist },
      { path: 'album/:source/:id', name: 'album', component: Album },
      { path: 'artist/:source/:id', name: 'artist', component: Artist },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/home' },
];

export function createAppRouter() {
  const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
  });

  router.beforeEach(async (to) => {
    // Решаем только после бутстрэпа: иначе гость до восстановления
    // сессии мелькнёт на /login, а залогиненный — споткнётся о гвард.
    const appStore = useAppStore();
    if (appStore.phase !== 'ready') {
      await appStore.bootstrap();
    }

    const auth = useAuthStore();
    const needsAuth = to.matched.some((record) => record.meta.requiresAuth);

    if (needsAuth && !auth.isAuthed) {
      return { path: '/login', query: { redirect: to.fullPath } };
    }

    if (to.meta.guestOnly && auth.isAuthed) {
      return '/home';
    }

    return true;
  });

  return router;
}

export default createAppRouter();
